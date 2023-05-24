const { expect } = require('chai');
const { ethers } = require('hardhat');
const setup = require('../scripts/deploy');
const { createWalletFromBjjPvtKey } = require('../scripts/libs/babyjub')

describe("L2 Contract", function () {
    this.timeout(3000);
    var accounts;
    var l2Contract;
    var erc20Mock;
    var w1;
    var w2;
    before(async () => {
        var data = await setup();
        accounts = data.accounts;
        l2Contract = data.l2Contract;
        erc20Mock = data.erc20Mock;
        const privateKey1 = Buffer.from("0001020304050607080900010203040506070809000102030405060708090001", "hex")
        const privateKey2 = Buffer.from("0002020304050607080900010203040506070809000102030405060708090001", "hex")
        w1 = await createWalletFromBjjPvtKey(privateKey1, accounts[0].address)
        w2 = await createWalletFromBjjPvtKey(privateKey2, accounts[1].address)
    });
    describe("L1 Transaction", async () => {
        it("add new token", async () => {
            var tx = await l2Contract.connect(accounts[0]).addToken(erc20Mock.address);
            await tx.wait()
            var newTokenIndex = await l2Contract.tokenMap(erc20Mock.address);
            expect(newTokenIndex).equal(1);
        });

        it("add l1 transaction", async () => {
            // var tx = await l2Contract.connect(accounts[0]).addToken(erc20Mock.address);
            // await tx.wait()

            var tx = await l2Contract.connect(accounts[0]).addL1Transaction(w1.publicKeyCompressed, 0, 0, 0, 1, 0)
            await tx.wait()
            var tx = await l2Contract.connect(accounts[1]).addL1Transaction(w2.publicKeyCompressed, 0, 0, 0, 1, 0)
            await tx.wait()
            console.log(await l2Contract.mapL1TxQueue(0))
        });
    })
})
