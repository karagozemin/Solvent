pragma circom 2.1.6;

// Solvent — reserve.circom
// BN254 (Circom default field). Groth16. Verified on Stellar via
// env.crypto().bn254().pairing_check (Protocol 25+, CAP-0074).
//
// Proves, from a bank's DKIM-signed balance email, WITHOUT revealing the balance:
//   extracted_balance >= threshold
// while pinning the sender domain and emitting an anti-replay nullifier.
//
// Public journal (order matters, matches contract): domain_hash, threshold,
// nullifier, timestamp.

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";
include "@zk-email/circuits/email-verifier.circom";
include "@zk-email/circuits/helpers/reveal-substring.circom";
include "@zk-email/circuits/utils/bytes.circom";

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
    // Substring window for the ASCII digits of the balance, located just after
    // the label "Available balance: $". The prover supplies the start index and
    // length; the circuit re-derives the integer and the >= constraint binds it.
    var MAX_BAL_DIGITS = 20;             // up to ~1e20, fits one field element
    signal input balanceStartIndex;
    signal input balanceLength;
    signal input balanceDigits[MAX_BAL_DIGITS]; // claimed digit bytes (validated)

    // ---- Domain + message-id (private) ----
    var DOMAIN_BYTES = 62;
    var MSGID_BYTES = 128;
    signal input fromDomain[DOMAIN_BYTES];      // sender domain, right-0-padded
    signal input messageId[MSGID_BYTES];        // Message-ID bytes, right-0-padded

    // ---- Public journal ----
    signal input threshold;             // public: reserve floor being proven
    signal input timestamp;             // public: email Date as unix seconds
    signal output domain_hash;          // public: PoseidonHash1(fold(fromDomain))
    signal output nullifier;            // public: PoseidonHash1(fold(messageId))
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
    // 2) Extract the balance substring from the (verified) body and re-derive
    //    the integer. RevealSubstring proves balanceDigits is really the body
    //    slice at [balanceStartIndex, +balanceLength]; DigitBytesToInt turns
    //    ASCII digits into the integer value.
    // ======================================================================
    component reveal = RevealSubstring(maxBodyLength, MAX_BAL_DIGITS, 0);
    reveal.in <== emailBody;
    reveal.substringStartIndex <== balanceStartIndex;
    reveal.substringLength <== balanceLength;
    for (var i = 0; i < MAX_BAL_DIGITS; i++) {
        reveal.substring[i] === balanceDigits[i];
    }

    component bal = DigitBytesToInt(MAX_BAL_DIGITS);
    bal.in <== balanceDigits;
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
    // 4) domain_hash = PoseidonHash1(fold(fromDomain))
    // ======================================================================
    component dser = Bytes2Field(DOMAIN_BYTES);
    dser.bytes <== fromDomain;
    component dh = PoseidonHash1();
    dh.in <== dser.out;
    domain_hash <== dh.out;

    // ======================================================================
    // 5) nullifier = PoseidonHash1(fold(messageId))
    // ======================================================================
    component mser = Bytes2Field(MSGID_BYTES);
    mser.bytes <== messageId;
    component nh = PoseidonHash1();
    nh.in <== mser.out;
    nullifier <== nh.out;

    // ======================================================================
    // 6) Echo public journal fields.
    // ======================================================================
    threshold_out <== threshold;
    timestamp_out <== timestamp;
}

// maxHeadersLength=1024, maxBodyLength=1536 (mult of 64), n=121, k=17 (RSA-2048).
// Public signals: threshold, timestamp (inputs) + outputs domain_hash,
// nullifier, threshold_out, timestamp_out.
component main { public [threshold, timestamp] } =
    Reserve(1024, 1536, 121, 17);
