const { expect } = require('chai');
const { ethers, network } = require('hardhat');
const setup = require('../scripts/deploy');
const { createWalletFromBjjPvtKey } = require('../scripts/libs/babyjub')
const { float40, RollupDB, SMTTmpDb } = require('@hermeznetwork/commonjs')
const { buildSMT, newMemEmptyTrie } = require('circomlibjs')

describe("L2 Contract", function () {
    this.timeout(3000);
    const maxTx = 512;
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
        l2Contract = data.l2Contract;
        erc20Mock = data.erc20Mock;
        const privateKey1 = Buffer.from("0001020304050607080900010203040506070809000102030405060708090001", "hex")
        const privateKey2 = Buffer.from("0002020304050607080900010203040506070809000102030405060708090001", "hex")
        w1 = await createWalletFromBjjPvtKey(privateKey1, accounts[0].address)
        w2 = await createWalletFromBjjPvtKey(privateKey2, accounts[1].address)
        var tx = await l2Contract.connect(accounts[0]).addToken(erc20Mock.address);
        await tx.wait()
        var chainID = network.config.chainId;
        var SMTMemDB = await newMemEmptyTrie();
        rollupDB = await RollupDB(SMTMemDB, chainID);
    });
    describe("L1 Transaction", async () => {
        it("add l1 transaction", async () => {
            // var tx = await l2Contract.connect(accounts[0]).addToken(erc20Mock.address);
            // await tx.wait()
            const initialLastForge = await l2Contract.nextL1FillingQueue();
            const initialCurrentForge = await l2Contract.nextL1ToForgeQueue();
            
            // BUild batch
            // bb = rollupDB.buildBatch(maxTx, nLevels, maxL1Tx)
            // let jsL1TxData = ""
            // for 


            // var tx = await l2Contract.connect(accounts[0]).addL1Transaction(w1.publicKeyCompressed, 0, 0, 0, 1, 0)
            // await tx.wait()
            // var tx = await l2Contract.connect(accounts[1]).addL1Transaction(w2.publicKeyCompressed, 0, 0, 0, 1, 0)
            // await tx.wait()
            // console.log(await l2Contract.mapL1TxQueue(0))

        });
    })
})
