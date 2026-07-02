pragma circom 2.1.6;
include "@zk-email/zk-regex-circom/circuits/common/from_addr_regex.circom";
// Same regex but over a NARROW 128-byte window (the fix hypothesis).
template M() {
    signal input msg[128];
    signal output out;
    signal output reveal0[128];
    component r = FromAddrRegex(128);
    r.msg <== msg;
    out <== r.out;
    reveal0 <== r.reveal0;
}
component main = M();
