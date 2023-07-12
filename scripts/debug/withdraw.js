const { ethers, upgrades, network } = require('hardhat');
const { poseidonContract } = require('circomlibjs');
const { l1TxCreateAccountDeposit, l1UserTxDeposit } = require('../helpers/helpers');
// const poseidonContract = require("circomlib/src/poseidon_gencontract");
const { calculateInputMaxTxLevels } = require('../helpers/helpers');
const { contracts } = require('../config/config');
const { generateAccount } = require('../utils/generateWallet.js');
const { float40, RollupDB, SMTTmpDb } = require('@hermeznetwork/commonjs');

async function getPoseidon(account) {
  let networkID = 1;
  if (network.name == 'hardhat') {
    networkID = 2;
  }
  let poseidon2 = contracts[networkID].poseidon2;
  let poseidon3 = contracts[networkID].poseidon3;
  let poseidon4 = contracts[networkID].poseidon4;
  let p2, p3, p4;
  if (poseidon2 == '') {
    const P2 = new ethers.ContractFactory(poseidonContract.generateABI(2), poseidonContract.createCode(2), account);
    const p2 = await P2.deploy();
    await p2.deployed();
    poseidon2 = p2.address;
  }
  if (poseidon3 == '') {
    const P3 = new ethers.ContractFactory(poseidonContract.generateABI(3), poseidonContract.createCode(3), account);
    const p3 = await P3.deploy();
    await p3.deployed();
    poseidon3 = p3.address;
  }
  if (poseidon4 == '') {
    const P4 = new ethers.ContractFactory(poseidonContract.generateABI(4), poseidonContract.createCode(4), account);
    const p4 = await P4.deploy();
    await p4.deployed();
    poseidon4 = p4.address;
  }
  console.log(poseidon2);

  return { poseidon2, poseidon3, poseidon4 };
}

async function getVerifierRollup() {
  let networkID = 1;
  if (network.name == 'hardhat') {
    networkID = 2;
  }
  let verifierRollup = contracts[networkID].rollup_verifier;
  if (verifierRollup == '') {
    const ROLLUPVERIFIER = await ethers.getContractFactory('VerifierRollup');
    const verifier = await ROLLUPVERIFIER.deploy();
    await verifier.deployed();
    verifierRollup = verifier.address;
  }

  return verifierRollup;
}
async function getMockToken(address) {
  const totalsupply = ethers.utils.parseUnits('1000000000', 18);
  if (network.name == 'hardhat') {
    const ERC20Mock = await ethers.getContractFactory('MockToken');
    const erc20Mock = await ERC20Mock.deploy('Mock', 'MCK', totalsupply);
    await erc20Mock.deployed();
    return erc20Mock.address;
  }
  return address;
}

async function getVerifierWithdraw() {
  let networkID = 1;
  if (network.name == 'hardhat') {
    networkID = 2;
  }
  let verifier = contracts[networkID].withdraw_verifier;
  if (verifier == '') {
    const WITHDRAWVERIFIER = await ethers.getContractFactory('VerifierWithdraw');
    const withdrawVerifier = await WITHDRAWVERIFIER.deploy();
    await withdrawVerifier.deployed();
    verifier = withdrawVerifier.address;
  }

  return verifier;
}

const main = async () => {
  var accounts = await ethers.getSigners();
  const listPrv = [1, 2, 3, 4];
  const listAddress = accounts.map((a) => a.address).slice(0, listPrv.length);
  const wallets = generateAccount(listPrv, listAddress);

  const maxTxVerifier = [16];
  const nLevelsVerifier = [8];
  var deployer = accounts[0];
  var verifierParam = await calculateInputMaxTxLevels(maxTxVerifier, nLevelsVerifier);
  // Deploy erc20
  const totalsupply = ethers.utils.parseUnits('1000000000', 18);
  // const ERC20Mock = await ethers.getContractFactory('MockToken');
  // const erc20MockInstance = await ERC20Mock.deploy('Mock', 'MCK', totalsupply);
  // await erc20MockInstance.deployed();
  // const erc20Mock = erc20MockInstance.address
  const erc20Mock = getMockToken('0x113409aD74eb1fA56E90408a57e5d759D5a13381');

  // Setup parameter
  const _forgeL1L2BatchTimeout = 10;

  // Deploy  verifiers
  // const ROLLUPVERIFIER = await ethers.getContractFactory('VerifierRollup');
  // const verifierRollup = await ROLLUPVERIFIER.deploy();
  // await verifierRollup.deployed();

  // const WITHDRAWVERIFIER = await ethers.getContractFactory('VerifierWithdraw');
  // const withdrawVerifier = await WITHDRAWVERIFIER.deploy();
  // await withdrawVerifier.deployed();

  // Deploy poseidon
  // const P2 = new ethers.ContractFactory(poseidonContract.generateABI(2), poseidonContract.createCode(2), accounts[0]);
  // const P3 = new ethers.ContractFactory(poseidonContract.generateABI(3), poseidonContract.createCode(3), accounts[0]);
  // const P4 = new ethers.ContractFactory(poseidonContract.generateABI(4), poseidonContract.createCode(4), accounts[0]);

  // const p2 = await P2.deploy();
  // await p2.deployed();

  // const p3 = await P3.deploy();
  // await p3.deployed();

  // const p4 = await P4.deploy();
  // await p4.deployed();

  const poseidon = await getPoseidon(accounts[0]);
  const verifierRollup = await getVerifierRollup();
  const verifierWithdraw = await getVerifierWithdraw();

  // Deploy L2 contract
  const ZKPAYMENT = await ethers.getContractFactory('ZkPayment');
  let zkPayment;
  zkPayment = await upgrades.deployProxy(ZKPAYMENT, [
    [verifierRollup],
    [verifierParam.toString()],
    verifierWithdraw,
    _forgeL1L2BatchTimeout,
    10,
    poseidon.poseidon2,
    poseidon.poseidon3,
    poseidon.poseidon4,
  ]);
  await zkPayment.deployed();
  console.log('zkPayment Address: ', zkPayment.address);
  console.log(`poseidon 2: ${poseidon.poseidon2}`);
  console.log(`poseidon 3: ${poseidon.poseidon3}`);
  console.log(`poseidon 4: ${poseidon.poseidon4}`);
  console.log(`rollup verifier: ${verifierRollup}`);
  console.log(`withdraw verifier: ${verifierWithdraw}`);
  console.log('zkpayment initialized');
  console.log('addL1Transaction Topic: ', zkPayment.interface.getEventTopic('L1UserTxEvent'));
  console.log('ForgeBatch Topic: ', zkPayment.interface.getEventTopic('ForgeBatch'));
  console.log('UpdateForgeL1L2BatchTimeout Topic: ', zkPayment.interface.getEventTopic('UpdateForgeL1L2BatchTimeout'));
  console.log('UpdateFeeAddToken Topic: ', zkPayment.interface.getEventTopic('UpdateFeeAddToken'));
  console.log('AddToken Topic: ', zkPayment.interface.getEventTopic('AddToken'));

  var addTokenTx = await zkPayment.addToken(erc20Mock);
  await addTokenTx.wait();
  console.log('add token success');
  const tokenID = 1;
  const amount = ethers.utils.parseUnits('300', 18);
  const siblings = ['0', '11542992933480913828002139471891817840143373180252903071389388558387315077692', '0', '0'];
  const babyjub = '66016679714640164429795023399046266159149544164935229259162469848630372483994';
  // const arrayState = await zkPayment.buildTreeState(tokenID, 0, amount, babyjub, "0x693C4171D99ba75E877f536e1c830D76EF1fd4AF")
  // console.log(`arrayState: ${arrayState}`)
  // const stateHash = await zkPayment.hash4Elements(arrayState)
  // console.log(`stateHash:${stateHash}`)
  //   const hashFinal = await zkPayment.hashFinalNode(32, stateHash);
  //   console.log(`hashFinal: ${hashFinal}`)
  //   const root = await zkPayment.calculateRoot(siblings, 32, stateHash)
  //   console.log(`root: ${root}`)
  console.log(accounts[3].address);
  await zkPayment.connect(accounts[1]).withdrawMerkleProof(tokenID, amount, babyjub, 9, siblings, 33, false);

  return {
    zkPayment,
    erc20Mock,
    accounts,
  };
};

require.main === module &&
  main()
    .then(() => process.exit())
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });

module.exports = main;
