pragma circom 2.1.6;
include "@zk-email/circuits/helpers/email-nullifier.circom";
// Isolated cost of EmailNullifier (PoseidonLarge(17) + Poseidon(1)).
template M() {
    signal input signature[17];
    signal output out;
    component nf = EmailNullifier(121, 17);
    nf.signature <== signature;
    out <== nf.out;
}
component main = M();
