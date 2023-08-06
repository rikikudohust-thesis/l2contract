const { ethers, upgrades, network } = require('hardhat');
const { poseidonContract } = require('circomlibjs');
const { l1TxCreateAccountDeposit, l1UserTxDeposit } = require('./helpers/helpers');
// const poseidonContract = require("circomlib/src/poseidon_gencontract");
const { calculateInputMaxTxLevels } = require('./helpers/helpers');
const { contracts } = require('./config/config');
const { generateAccount } = require('./utils/generateWallet.js');
const { float40, RollupDB, SMTTmpDb } = require('@hermeznetwork/commonjs');
const { signCreateAccountAuthorization, signWithdraw } = require('./utils/signData');
const _forgeL1L2BatchTimeout = 10;
async function getPoseidon(account, chainID) {
  let networkID = chainID;
  let poseidon2 = contracts[networkID].poseidon2;
  let poseidon3 = contracts[networkID].poseidon3;
  let poseidon4 = contracts[networkID].poseidon4;
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

  return { poseidon2, poseidon3, poseidon4 };
}

async function getVerifierRollup(chainID) {
  let networkID = chainID;
  let verifierRollup = contracts[networkID].rollup_verifier;
  if (verifierRollup == '') {
    const ROLLUPVERIFIER = await ethers.getContractFactory('VerifierRollup');
    const verifier = await ROLLUPVERIFIER.deploy();
    await verifier.deployed();
    return verifier;
  } else {
    const verifier = await ethers.getContractAt('VerifierRollup', verifierRollup);
    return verifier;
  }
}

async function getVerifierWithdraw(chainID) {
  let networkID = chainID;
  let verifier = contracts[networkID].withdraw_verifier;
  if (verifier == '') {
    const WITHDRAWVERIFIER = await ethers.getContractFactory('VerifierWithdraw');
    const withdrawVerifier = await WITHDRAWVERIFIER.deploy();
    await withdrawVerifier.deployed();
    return withdrawVerifier;
  } else {
    const withdrawVerifier = await ethers.getContractAt('VerifierWithdraw', verifier);
    return withdrawVerifier;
  }
}

async function getTokens(tokens, chainID) {
  let networkID = chainID;
  let result = [];
  const totalsupply = ethers.utils.parseUnits('1000000000', 18);
  for (let i = 0; i < tokens.length; i++) {
    const tokenAddresses = contracts[networkID].tokens;
    const token = tokenAddresses[tokens[i]];
    if (token == '') {
      const ERC20Mock = await ethers.getContractFactory('MockToken');
      const erc20Mock = await ERC20Mock.deploy(tokens[i], tokens[i], totalsupply);
      await erc20Mock.deployed();
      result.push(erc20Mock.address);
    } else {
      result.push(token);
    }
  }

  return result;
}

async function getZKPayment(chainID, p2, p3, p4, verifierRollup, verifierWithdraw, verifierParam) {
  const zkpaymentAddress = contracts[chainID].zkPayment;
  const isNew = false;
  // let zkPayment;
  if (zkpaymentAddress == '') {
    const ZKPAYMENT = await ethers.getContractFactory('ZkPayment');
    const zkPayment = await upgrades.deployProxy(ZKPAYMENT, [
      [verifierRollup],
      [verifierParam.toString()],
      verifierWithdraw,
      _forgeL1L2BatchTimeout,
      10,
      p2,
      p3,
      p4,
    ]);
    await zkPayment.deployed();
    return zkPayment;
  }
  return await ethers.getContractAt('ZkPayment', zkpaymentAddress);

  // return zkPayment;
}

const main = async () => {
  var chainID = network.config.chainId;
  if (network.name == 'hardhat') {
    chainID = 2;
  }
  var supportToken = ['USDC', 'USDT', 'WBTC'];
  var accounts = await ethers.getSigners();
  const listPrv = [1, 2, 3, 4];
  const listAddress = accounts.map((a) => a.address).slice(0, listPrv.length);
  const wallets = generateAccount(listPrv, listAddress);

  const maxTxVerifier = [16];
  const nLevelsVerifier = [8];
  var deployer = accounts[0];
  var verifierParam = await calculateInputMaxTxLevels(maxTxVerifier, nLevelsVerifier);
  // Deploy erc20
  const tokens = await getTokens(supportToken, chainID);

  // Setup parameter

  const poseidon = await getPoseidon(accounts[0], chainID);
  const verifierRollup = await getVerifierRollup(chainID);
  const verifierWithdraw = await getVerifierWithdraw(chainID);

  // Deploy L2 contract
  // const ZKPAYMENT = await ethers.getContractFactory('ZkPayment');
  // let zkPayment;
  // zkPayment = await upgrades.deployProxy(ZKPAYMENT, [
  //   [verifierRollup],
  //   [verifierParam.toString()],
  //   verifierWithdraw,
  //   _forgeL1L2BatchTimeout,
  //   10,
  //   poseidon.poseidon2,
  //   poseidon.poseidon3,
  //   poseidon.poseidon4,
  // ]);
  // await zkPayment.deployed();
  const zkPayment = await getZKPayment(
    chainID,
    poseidon.poseidon2,
    poseidon.poseidon3,
    poseidon.poseidon4,
    verifierRollup.address,
    verifierWithdraw.address,
    verifierParam
  );
  await zkPayment.deployed();
  console.log('zkPayment Address: ', zkPayment.address);
  console.log(`poseidon 2: ${poseidon.poseidon2}`);
  console.log(`poseidon 3: ${poseidon.poseidon3}`);
  console.log(`poseidon 4: ${poseidon.poseidon4}`);
  console.log(`rollup verifier: ${verifierRollup.address}`);
  console.log(`withdraw verifier: ${verifierWithdraw.address}`);
  console.log('withdraw event: ', zkPayment.interface.getEventTopic('WithdrawEvent'));
  console.log('zkpayment initialized');
  if (contracts[chainID].zkPayment != '') return;
  for (let i = 0; i < tokens.length; i++) {
    console.log(`${supportToken[i]}: ${tokens[i]}`);
    var addTokenTx = await zkPayment.addToken(tokens[i]);
    await addTokenTx.wait();
  }
  console.log('add l1 tx success');

  // await zkPayment.withdrawMerkleProof(1, ethers.utils.parseUnits('200', 18), ' ', 13, [], 32, false);

  //Sign data
  // accounts[0]._signTypedData;
  // const providerUrl = network.config.url;
  // const signer = accounts[0];
  // const bjj = `0x8bcde65e2937b60284cd4ad771dde597c0d3a867c27ff5ad08817460c845499e`;

  // const DOMAIN_SEPARATOR = await zkPayment.DOMAIN_SEPARATOR();

  // const signature = await signCreateAccountAuthorization(signer, bjj, zkPayment.address);
  // var tx = await zkPayment.addL1Transaction(bjj, 0, 0, 0, 1, 0, signature);
  // await tx.wait();

  // const signature = await signWithdraw(signer, bjj, accounts[1].address, zkPayment.address);
  // var tx = await zkPayment.connect(accounts[1]).withdrawMerkleProof(1, ethers.utils.parseEther('10'), bjj, 15, [], 0, false, signature);
  // await tx.wait()

  return {
    zkPayment,
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
