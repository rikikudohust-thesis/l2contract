const { ethers } = require('hardhat')
const { l1TxCreateAccountDeposit } = require('./helpers/helpers')
const { createWalletFromBjjPvtKey } = require('../scripts/libs/babyjub')
const { float40, RollupDB, SMTTmpDb } = require('@hermeznetwork/commonjs')

async function main() {

    accounts = await ethers.getSigners();
    const erc20MockAddress = "0x4b5CbEc9262BCeC0eE2fB2834BE5F17aC81455de";
    const erc20Mock = await ethers.getContractAt("MockToken", erc20MockAddress);
    const zkPaymentAddress = "0x6a38Ec619c37A04aF3F16354C4e40b64534cE2b6"
    const zkPayment = await ethers.getContractAt("ZkPayment", zkPaymentAddress);

    const maxTx = 344;
    const maxL1Tx = 256;
    const nLevels = 32;


    const privateKey1 = Buffer.from("0001020304050607080900010203040506070809000102030405060708090001", "hex")
    const w1 = await createWalletFromBjjPvtKey(privateKey1, accounts[0].address)
    const tokenID = 1;
    const babyjub = w1.publicKeyCompressed;
    const loadAmount = float40.round(1000);
    // const l1TxUserArray = []

    // l1TxUserArray.push(
    await l1TxCreateAccountDeposit(
        loadAmount,
        tokenID,
        babyjub,
        accounts[0],
        zkPayment,
        erc20Mock
    )
    // )
}

main().then().catch((err) => {
    console.error(err)
})
