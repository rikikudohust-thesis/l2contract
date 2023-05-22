const { ethers } = require('hardhat')
const { poseidonContract } = require('circomlibjs')


const main = async () => {
    // Deploy erc20
    const totalsupply = ethers.utils.parseUnits("1000000", 18);
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
    const accounts = await ethers.getSigners();
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
    const L2Contract = await ethers.getContractFactory("L2Contract")
    const l2Contract = await L2Contract.deploy(
        [verifierRollup.address],
        withdrawVerifier.address,
        _forgeL1L2BatchTimeout,
        p2.address,
        p3.address,
        p4.address
    )

    await l2Contract.deployed()

    return {
        l2Contract,
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