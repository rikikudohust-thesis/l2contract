const { expect } = require('chai');
const { ethers, network } = require('hardhat');
const setup = require('../scripts/deploy');
const { createWalletFromBjjPvtKey } = require('../scripts/libs/babyjub')
const { float40, RollupDB, SMTTmpDb } = require('@hermeznetwork/commonjs')
const { calculateInputMaxTxLevels, l1TxCreateAccountDeposit, Forger } = require('../scripts/helpers/helpers')
const SMTMemDB = require('circomlib').SMTMemDB

describe("L2 Contract", function () {
    const maxTx = 344;
    const maxL1Tx = 256;
    const nLevels = 32;
    var accounts;
    var zkPayment;
    var erc20Mock;
    var w1;
    var w2;
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

    });
    describe("L1 Transaction", async () => {

        // it("create account", async () => {
        //     this.timeout(0)
        // });

        it("create account deposit", async () => {
            this.timeout(0)
            const tokenID = 1;
            const babyjub = w1.publicKeyCompressed;
            const loadAmount = float40.round(1000);
            const l1TxUserArray = []

            var chainID = network.config.chainId;
            var rollupDB = await RollupDB(new SMTMemDB(), chainID);
            var forgerTest = new Forger(
                maxTx,
                maxL1Tx,
                nLevels,
                zkPayment,
                rollupDB
            )


            const initalLastForge = await zkPayment.nextL1FillingQueue();
            const initialCurrentForge = await zkPayment.nextL1ToForgeQueue();
            for (let i = 0; i < 127; i++) {
                l1TxUserArray.push(
                    await l1TxCreateAccountDeposit(
                        loadAmount,
                        tokenID,
                        babyjub,
                        accounts[0],
                        zkPayment,
                        erc20Mock
                    )
                )
            }
            expect(initalLastForge).to.equal(
                await zkPayment.nextL1FillingQueue()
            );

            expect(initialCurrentForge).to.equal(
                await zkPayment.nextL1ToForgeQueue()
            );
            // l1TxUserArray.push(
            //     await l1TxCreateAccountDeposit(
            //         loadAmount,
            //         tokenID,
            //         babyjub,
            //         accounts[0],
            //         zkPayment,
            //         erc20Mock
            //     )
            // );

            // const after128L1LastForge = await zkPayment.nextL1FillingQueue();
            // const after128CurrentForge = await zkPayment.nextL1ToForgeQueue();
            // console.log(`after128L1LastForge: ${after128L1LastForge}`)
            // console.log(`after128CurrentForge: ${after128CurrentForge}`)
            // expect(parseInt(initalLastForge) + 1).to.equal(after128L1LastForge);
            // expect(parseInt(initialCurrentForge)).to.equal(after128CurrentForge);

            await forgerTest.forgeBatch(true, l1TxUserArray, []);

        });
        // it("create account deposit and transfer", async () => {

        //     this.timeout(0)
        // });

        // it("deposit", async () => {
        //     this.timeout(0)

        // })

        // it("exit", async () => {
        //     this.timeout(0)

        // });

        // it("transfer", async () => {
        //     this.timeout(0)

        // });
    })
})
