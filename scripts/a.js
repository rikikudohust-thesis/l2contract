const Scalar = require("ffjavascript").Scalar;

async function main() {
    let res = Scalar.e(0)
    console.log(res)
    res = Scalar.add(res, 5)
    console.log(res)
    res = Scalar.add(res, Scalar.shl(1, 48));
    console.log(res)
}

main().then