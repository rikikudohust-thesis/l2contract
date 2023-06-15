const {float40} = require('@hermeznetwork/commonjs')


async function main() {
    var data = float40.round(1000)
    console.log(float40.fix2Float(data))
}

main().then