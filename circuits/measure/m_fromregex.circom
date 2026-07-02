pragma circom 2.1.6;
// Isolated cost of FromAddrRegex over the full 640-byte header window.
include "@zk-email/zk-regex-circom/circuits/common/from_addr_regex.circom";
template M() {
    signal input msg[640];
    signal output out;
    component r = FromAddrRegex(640);
    r.msg <== msg;
    out <== r.out;
}
component main = M();
