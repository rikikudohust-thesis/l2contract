const { ethers, upgrades } = require('hardhat')
// const { poseidonContract } = require('circomlibjs')
const poseidonContract = require('circomlib/src/poseidon_gencontract');
const { calculateInputMaxTxLevels } = require('./helpers/helpers');


const main = async () => {
    var accounts = await ethers.getSigners()

    const maxTxVerifier = [344];
    const nLevelsVerifier = [32];
    var deployer = accounts[0];
    var verifierParam = await calculateInputMaxTxLevels(maxTxVerifier, nLevelsVerifier)
    // Deploy erc20
    const totalsupply = ethers.utils.parseUnits("1000000000", 18);
    const ERC20Mock = await ethers.getContractFactory("MockToken");
    const erc20Mock = await ERC20Mock.deploy("Mock", "MCK", totalsupply);
    await erc20Mock.deployed();

    // Setup parameter 
    const _forgeL1L2BatchTimeout = 10

    // Deploy  verifiers
    const ROLLUPVERIFIER = await ethers.getContractFactory("VerifierRollup")
    const verifierRollup = await ROLLUPVERIFIER.deploy()
    await verifierRollup.deployed()

    const WITHDRAWVERIFIER = await ethers.getContractFactory("VerifierWithdraw")
    const withdrawVerifier = await WITHDRAWVERIFIER.deploy()
    await withdrawVerifier.deployed()

    // Deploy poseidon 
    const P2 = new ethers.ContractFactory(
        poseidonContract.generateABI(2),
        poseidonContract.createCode(2),
        accounts[0]
    )
    const P3 = new ethers.ContractFactory(
        poseidonContract.generateABI(3),
        poseidonContract.createCode(3),
        accounts[0]
    )
    const P4 = new ethers.ContractFactory(
        poseidonContract.generateABI(4),
        poseidonContract.createCode(4),
        accounts[0]
    )

    const p2 = await P2.deploy()
    await p2.deployed()

    const p3 = await P3.deploy()
    await p3.deployed()

    const p4 = await P4.deploy()
    await p4.deployed()


    // Deploy L2 contract
    const ZKPAYMENT = await ethers.getContractFactory("ZkPayment")
    let zkPayment;
    zkPayment = await upgrades.deployProxy(ZKPAYMENT, [[verifierRollup.address],
    [verifierParam.toString()],
    withdrawVerifier.address,
        _forgeL1L2BatchTimeout,
        10,
    p2.address,
    p3.address,
    p4.address], 
    );
    await zkPayment.deployed();
    console.log("zkPayment Address: ", zkPayment.address)
    console.log("zkpayment initialized")

    return {
        zkPayment,
        erc20Mock,
        accounts
    }
}

require.main === module &&
    main()
        .then(() => process.exit())
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });

module.exports = main;