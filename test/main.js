const {expect}= require('chai');
const {ethers} =  require('hardhat');
const setup = require('../scripts/deploy');

describe("L2 Contract", function() {
    this.timeout(3000);
    var accounts;
    var l2Contract;
    var erc20Mock;
    before(async () => {
        var data = await setup();
        accounts = data.accounts;
        l2Contract = data.l2Contract;
        erc20Mock = data.erc20Mock;
    });
    describe("L1 Transaction", async () => {
        it("add new token", async() => {
            var tx = await l2Contract.connect(accounts[0]).addToken(erc20Mock.address);
            await tx.wait()
            var newTokenIndex = await l2Contract.tokenMap(erc20Mock.address);
            expect(newTokenIndex).equal(1);
        });
        it("add l1 transaction", async () => {
        });
    })
})
