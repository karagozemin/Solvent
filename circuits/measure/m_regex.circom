pragma circom 2.1.6;
include "@zk-email/zk-regex-circom/circuits/common/from_addr_regex.circom";
// Isolated cost of FromAddrRegex over the full 640-byte header window.
template M() {
    signal input msg[640];
    signal output out;
    signal output reveal0[640];
    component r = FromAddrRegex(640);
    r.msg <== msg;
    out <== r.out;
    reveal0 <== r.reveal0;
}
component main = M();
