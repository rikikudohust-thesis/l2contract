const { expect } = require('chai');
const { ethers, network } = require('hardhat');
const setup = require('../scripts/deploy');
const { createWalletFromBjjPvtKey } = require('../scripts/libs/babyjub')
const { float40, RollupDB, SMTTmpDb } = require('@hermeznetwork/commonjs')
const { buildSMT, newMemEmptyTrie } = require('circomlibjs')

describe("L2 Contract", function () {
    this.timeout(3000);
    const maxTx = 344;
    const maxL1Tx = 256;
    const nLevels = 32;
    var accounts;
    var l2Contract;
    var erc20Mock;
    var w1;
    var w2;
    var rollupDB;
    var bb;
    beforeEach(async () => {
        var data = await setup();
        accounts = data.accounts;
        zkPayment = data.zkPayment;
        erc20Mock = data.erc20Mock;
        const privateKey1 = Buffer.from("0001020304050607080900010203040506070809000102030405060708090001", "hex")
        const privateKey2 = Buffer.from("0002020304050607080900010203040506070809000102030405060708090001", "hex")
        w1 = await createWalletFromBjjPvtKey(privateKey1, accounts[0].address)
        w2 = await createWalletFromBjjPvtKey(privateKey2, accounts[1].address)
        var tx = await zkPayment.connect(accounts[0]).addToken(erc20Mock.address);
        await tx.wait()
        var chainID = network.config.chainId;
        var SMTMemDB = await newMemEmptyTrie();
        rollupDB = await RollupDB(SMTMemDB, chainID);
    });
    describe("L1 Transaction", async () => {
        it("create account", async () => {
        });

        it("create account deposit", async () => {

        });
        it("create account deposit and transfer", async () => {

        });

        it("deposit", async() => {

        })

        it("exit", async () => {

        });

        it("transfer", async () => {

        });
    })
})
