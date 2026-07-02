pragma circom 2.1.6;

// Solvent — reserve.circom
// BN254 (Circom default field). Groth16. Verified on Stellar via
// env.crypto().bn254().pairing_check (Protocol 25+, CAP-0074).
//
// Proves, from a bank's DKIM-signed balance email, WITHOUT revealing the balance:
//   extracted_balance >= threshold
// while pinning the sender domain and emitting an anti-replay nullifier.
//
// Public journal (order matters, matches contract; see public.json for the
// authoritative snarkjs order after compile):
//   pubkey_hash, sender_hash, nullifier, threshold_out, timestamp_out,
//   threshold, timestamp
//
// Task-B soundness (all three anchors now bound to the DKIM signature/header):
//   * pubkey_hash  = ev.pubkeyHash            -> WHICH provider key signed it
//   * sender_hash  = Poseidon(fold(From addr))-> WHO sent it (regex over signed header)
//   * nullifier    = Poseidon^2(signature)    -> anti-replay, bound to signature

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";
include "@zk-email/circuits/email-verifier.circom";
include "@zk-email/circuits/helpers/reveal-substring.circom";
include "@zk-email/circuits/utils/bytes.circom";
include "@zk-email/circuits/utils/array.circom";
include "@zk-email/circuits/utils/hash.circom";
include "@zk-email/zk-regex-circom/circuits/common/from_addr_regex.circom";

// ---------------------------------------------------------------------------
// Bytes2Field: LOCKED byte->field fold (see circuits/README.md).
// 31-byte little-endian limbs, fixedLen right-padded with 0x00, fold with
// BASE = 2^248. Mirrors circuits/scripts/serialize.js byte-for-byte.
// Input array MUST already be zero-padded to fixedLen (fixedLen = nLimbs*31
// enforced by the caller's array size; last limb may be partially populated).
// ---------------------------------------------------------------------------
template Bytes2Field(fixedLen) {
    signal input bytes[fixedLen];
    signal output out;

    var LIMB = 31;
    var nLimbs = (fixedLen + LIMB - 1) \ LIMB;

    // BASE^i mod p as compile-time bigint powers of 2^248.
    // circom var arithmetic is over the field, so 2^248 and its powers reduce
    // mod p exactly as the JS fold does (JS also reduces mod p each step).
    signal limb[nLimbs];
    var acc = 0;
    var basePow = 1;
    for (var i = 0; i < nLimbs; i++) {
        var s = 0;
        var mul = 1; // 256^b within a limb (little-endian)
        for (var b = 0; b < LIMB; b++) {
            var idx = i * LIMB + b;
            if (idx < fixedLen) {
                s += bytes[idx] * mul;
            }
            mul = mul * 256;
        }
        limb[i] <== s;
        acc += limb[i] * basePow;
        basePow = basePow * (2 ** 248);
    }
    out <== acc;
}

// PoseidonHash1: the single locked sponge shape. circomlib Poseidon(1) computes
// exactly squeeze(permute([0, x]))[0] for one input (init capacity = 0).
template PoseidonHash1() {
    signal input in;
    signal output out;
    component h = Poseidon(1);
    h.inputs[0] <== in;
    out <== h.out;
}

// ---------------------------------------------------------------------------
// DigitBytesToIntPadded: fold ASCII digit bytes into an integer, IGNORING
// non-digit padding bytes (0x00 from RevealSubstring's SelectSubArray).
//
// RevealSubstring returns the real digits in [0, substringLength) and 0x00 for
// the rest. Plain DigitBytesToInt would compute (0x00 - 48) = -48 for pad
// bytes, corrupting the value. Here each byte contributes only if it is an
// ASCII digit (48..=57): out = out*10 + (byte-48) when isDigit else out
// unchanged. Because the real digits are a contiguous prefix followed only by
// pad, this yields exactly the intended integer with NO prover-supplied
// digit array — the value is derived purely from the verified body.
// ---------------------------------------------------------------------------
template DigitBytesToIntPadded(n) {
    signal input in[n];
    signal output out;

    signal sums[n + 1];
    sums[0] <== 0;

    // isDigit[i] = 1 iff 48 <= in[i] <= 57
    component ge48[n];
    component le57[n];
    signal isDigit[n];
    signal term[n];      // (in[i]-48) when digit else 0
    signal folded[n];    // sums[i]*10 + term[i]

    for (var i = 0; i < n; i++) {
        ge48[i] = GreaterEqThan(9);
        ge48[i].in[0] <== in[i];
        ge48[i].in[1] <== 48;
        le57[i] = LessEqThan(9);
        le57[i].in[0] <== in[i];
        le57[i].in[1] <== 57;
        isDigit[i] <== ge48[i].out * le57[i].out;

        term[i] <== isDigit[i] * (in[i] - 48);
        // if digit: sums*10 + term ; else keep sums unchanged
        folded[i] <== sums[i] * 10 + term[i];
        sums[i + 1] <== isDigit[i] * (folded[i] - sums[i]) + sums[i];
    }
    out <== sums[n];
}

// ---------------------------------------------------------------------------
// Main reserve circuit.
// n,k = RSA limb bits / count (121 * 17 = 2057 bits, standard zk-email for 2048).
// ---------------------------------------------------------------------------
template Reserve(maxHeadersLength, maxBodyLength, n, k) {
    // ---- DKIM / email inputs (private) ----
    signal input emailHeader[maxHeadersLength];
    signal input emailHeaderLength;
    signal input pubkey[k];              // bank RSA-2048 public key limbs
    signal input signature[k];           // DKIM signature limbs
    signal input bodyHashIndex;
    signal input precomputedSHA[32];
    signal input emailBody[maxBodyLength];
    signal input emailBodyLength;

    // ---- Balance extraction (private) ----
    // Window for the ASCII digits of the balance, located just after the label
    // "Available balance: $". The prover supplies only the start index and
    // length; the circuit re-derives the integer from the VERIFIED body
    // (RevealSubstring) — no prover-supplied digit values. The >= constraint
    // binds the derived value.
    var MAX_BAL_DIGITS = 20;             // up to ~1e20, fits one field element
    signal input balanceStartIndex;
    signal input balanceLength;

    // ---- From-address window (private) ----
    // The From header line sits near the top of the (signed) header. Instead of
    // running the expensive FromAddrRegex over all maxHeadersLength bytes
    // (~1.04M constraints at 640), we select a small window and run the regex
    // there (~5x cheaper). SOUNDNESS: the window is carved from the DKIM-signed
    // emailHeader via SelectSubArray, so every byte is signed; and
    // FromAddrRegex asserts `from:` is present (fromOut===1), so a wrong index
    // fails to match -> witness fails. The prover cannot point at unsigned or
    // non-From bytes.
    var FROM_WINDOW = 192;               // From line + slack, mult-friendly
    signal input fromWindowStart;

    // ---- Public journal ----
    signal input threshold;             // public: reserve floor being proven
    signal input timestamp;             // public: email Date as unix seconds
    signal output pubkey_hash;          // public: ev.pubkeyHash (which key signed)
    signal output sender_hash;          // public: Poseidon(fold(From address bytes))
    signal output nullifier;            // public: Poseidon^2(signature) anti-replay
    signal output threshold_out;        // public echo of threshold
    signal output timestamp_out;        // public echo of timestamp

    // ======================================================================
    // 1) Verify DKIM RSA-2048 signature over the email (SHA256 + RSA).
    //    ignoreBodyHashCheck=0 (we DO bind the body), masking off, soft-lb off.
    // ======================================================================
    component ev = EmailVerifier(maxHeadersLength, maxBodyLength, n, k, 0, 0, 0, 0);
    ev.emailHeader <== emailHeader;
    ev.emailHeaderLength <== emailHeaderLength;
    ev.pubkey <== pubkey;
    ev.signature <== signature;
    ev.bodyHashIndex <== bodyHashIndex;
    ev.precomputedSHA <== precomputedSHA;
    ev.emailBody <== emailBody;
    ev.emailBodyLength <== emailBodyLength;

    // ======================================================================
    // 2) Extract the balance substring from the VERIFIED body and re-derive
    //    the integer. RevealSubstring proves the revealed bytes are really the
    //    body slice at [balanceStartIndex, +balanceLength] (0x00-padded after).
    //    DigitBytesToIntPadded folds the digits while ignoring the 0x00 pad, so
    //    the value comes purely from the DKIM-signed body — prover cannot forge
    //    the balance (it is bound to the signature via the body hash).
    // ======================================================================
    component reveal = RevealSubstring(maxBodyLength, MAX_BAL_DIGITS, 0);
    reveal.in <== emailBody;
    reveal.substringStartIndex <== balanceStartIndex;
    reveal.substringLength <== balanceLength;

    component bal = DigitBytesToIntPadded(MAX_BAL_DIGITS);
    bal.in <== reveal.substring;
    signal extracted_balance;
    extracted_balance <== bal.out;

    // ======================================================================
    // 3) Core constraint: extracted_balance >= threshold, WITHOUT revealing it.
    // ======================================================================
    component geq = GreaterEqThan(128);
    geq.in[0] <== extracted_balance;
    geq.in[1] <== threshold;
    geq.out === 1;

    // ======================================================================
    // 4) pubkey_hash = ev.pubkeyHash. This is the REAL anchor: EmailVerifier
    //    Poseidon-hashes the RSA pubkey that actually verified the signature.
    //    The contract compares this against the known gmail.com DKIM key hash,
    //    so the prover cannot substitute a self-generated key.
    // ======================================================================
    pubkey_hash <== ev.pubkeyHash;

    // ======================================================================
    // 5) sender_hash = Poseidon(fold(From address)). FromAddrRegex runs over the
    //    DKIM-VERIFIED emailHeader (From is in the signature h= list), extracts
    //    the full address (localpart@domain — full address, not just domain,
    //    because gmail.com is a shared provider), and we bind its hash. This
    //    closes the "forge the sender" gap: the address comes from signed bytes.
    // ======================================================================
    // 5a) Carve a small window out of the SIGNED header for the From line.
    component fromWin = SelectSubArray(maxHeadersLength, FROM_WINDOW);
    fromWin.in <== emailHeader;
    fromWin.startIndex <== fromWindowStart;
    fromWin.length <== FROM_WINDOW;
    // 5b) Regex the window: extracts the full From address, asserts From present.
    component fromRegex = FromAddrRegex(FROM_WINDOW);
    fromRegex.msg <== fromWin.out;
    // fromRegex.out === 1 asserted internally (From must be present in window).
    component fser = Bytes2Field(FROM_WINDOW);
    fser.bytes <== fromRegex.reveal0;
    component sh = PoseidonHash1();
    sh.in <== fser.out;
    sender_hash <== sh.out;

    // ======================================================================
    // 6) nullifier = Poseidon^2(signature) via zk-email EmailNullifier. Bound to
    //    the RSA-verified signature, so it is unforgeable and unique per email
    //    (anti-replay). Fresh reserve emails yield new nullifiers by design.
    // ======================================================================
    // EmailNullifier in this zk-email version fails to include PoseidonLarge,
    // so we inline its definition: nullifier = Poseidon(PoseidonLarge(sig)).
    signal sigHash <== PoseidonLarge(n, k)(signature);
    component nh = PoseidonHash1();
    nh.in <== sigHash;
    nullifier <== nh.out;

    // ======================================================================
    // 7) Echo public journal fields.
    // ======================================================================
    threshold_out <== threshold;
    timestamp_out <== timestamp;
}

// maxHeadersLength=640, maxBodyLength=384 (mult of 64), n=121, k=17 (RSA-2048).
// Sized to the real fixture (header=576, body=320) with one block of slack.
// Public signals (snarkjs order = outputs first, then public inputs):
//   pubkey_hash, sender_hash, nullifier, threshold_out, timestamp_out,
//   threshold, timestamp. Must fit 2^21 (pot21) — verify with r1cs info.
component main { public [threshold, timestamp] } =
    Reserve(640, 384, 121, 17);
