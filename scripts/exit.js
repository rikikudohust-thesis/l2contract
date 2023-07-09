const { ethers } = require('hardhat')
const { l1TxCreateAccountDeposit, l1UserTxDeposit } = require('./helpers/helpers')
const { createWalletFromBjjPvtKey } = require('../scripts/libs/babyjub')
const { float40, RollupDB, SMTTmpDb } = require('@hermeznetwork/commonjs')

async function main() {

    accounts = await ethers.getSigners();
    const erc20MockAddress = "0x113409aD74eb1fA56E90408a57e5d759D5a13381";
    const erc20Mock = await ethers.getContractAt("MockToken", erc20MockAddress);
    const zkPaymentAddress = "0x7E6b170c6639B268a49FD383bdB93EE0A0E39620"
    const zkPayment = await ethers.getContractAt("ZkPayment", zkPaymentAddress);

    const maxTx = 344;
    const maxL1Tx = 256;
    const nLevels = 32;


    const privateKey1 = Buffer.from("0001020304050607080900010203040506070809000102030405060708090001", "hex")
    const w1 = await createWalletFromBjjPvtKey(privateKey1, accounts[0].address)
    const tokenID = 1;
    const babyjub = w1.publicKeyCompressed;
    const loadAmount = float40.round(ethers.utils.parseUnits("100", 18));
    // const l1TxUserArray = []
    // console.log(await zkPayment.lastForgedBatch())

    // l1TxUserArray.push(
    await l1UserTxDeposit(
        loadAmount,
        tokenID,
        32,
        accounts[0],
        zkPayment,
        erc20Mock
    )
    // )
}

main().then().catch((err) => {
    console.error(err)
})
