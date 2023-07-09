const { ethers, upgrades, network } = require('hardhat');
const { poseidonContract } = require('circomlibjs');
const { l1TxCreateAccountDeposit, l1UserTxDeposit } = require('./helpers/helpers')
// const poseidonContract = require("circomlib/src/poseidon_gencontract");
const { calculateInputMaxTxLevels } = require('./helpers/helpers');
const { contracts } = require('./config/config');
const { generateAccount } = require('./utils/generateWallet.js');
const { float40, RollupDB, SMTTmpDb } = require('@hermeznetwork/commonjs')

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

  // const data = "0xeedfc30449647c407a98e6034a9d8eba2d9bac69d6d6a6c7c4cf19269c7ef40d1b571752361c2e62d080ccb2296dc5e99b8aad200000000000000000000000000000000000000001000000000000";
  var addL1tx_0 = await zkPayment
    .connect(accounts[0])
    .addL1Transaction(`0x${wallets[0].publicKeyCompressedHex}`, 0, 0, 0, 1, 0);
  await addL1tx_0.wait();

  var addL1tx_1 = await zkPayment
    .connect(accounts[1])
    .addL1Transaction(`0x${wallets[1].publicKeyCompressedHex}`, 0, 0, 0, 1, 0);
  await addL1tx_1.wait();

  var addL1tx_2 = await zkPayment
    .connect(accounts[2])
    .addL1Transaction(`0x${wallets[2].publicKeyCompressedHex}`, 0, 0, 0, 1, 0);
  await addL1tx_2.wait();

  var addL1tx_3 = await zkPayment
    .connect(accounts[3])
    .addL1Transaction(`0x${wallets[3].publicKeyCompressedHex}`, 0, 0, 0, 1, 0);
  await addL1tx_3.wait();

  console.log('add l1 tx success');
  // proofA: [
  //   +20551633666884158154647234706412647048285156175154936941116964149640911024150 +
  //     20028898896587263319092492998092719168955781611645144979541638062970369460643,
  // ];
  // proofB: [
  //   [
  //     +2865589356266269405775970989453958570738521020062371739811066814864407231235 +
  //       1955937554287924472892157841383419524754513299547867821613044782598992508212,
  //   ][
  //     +12097257349656500736861917650608451966845488870532407717206961208417199261793 +
  //       5657788600425800460291753913382947941175130788146648681220250500892461752514
  //   ],
  // ];
  // proofC: [
  //   +8435809633071185534218912900084102695113344401591588636334182385907420401168 +
  //     3220458822487930129773070909678886194688729411088071531437094740831484717283,
  // ];

  // var proofA = [
  //   '20551633666884158154647234706412647048285156175154936941116964149640911024150',
  //   '20028898896587263319092492998092719168955781611645144979541638062970369460643',
  // ];
  // var proofB = [
  //   [
  //     '2865589356266269405775970989453958570738521020062371739811066814864407231235',
  //     '1955937554287924472892157841383419524754513299547867821613044782598992508212',
  //   ],
  //   [
  //     '12097257349656500736861917650608451966845488870532407717206961208417199261793',
  //     '5657788600425800460291753913382947941175130788146648681220250500892461752514',
  //   ],
  // ];

  // var proofC = [
  //   '8435809633071185534218912900084102695113344401591588636334182385907420401168',
  //   '3220458822487930129773070909678886194688729411088071531437094740831484717283',
  // ];

  // var forgeTx = await zkPayment.forgeBatch(31, '0', '0', '0x00', '0x00', '0x00', 0, true, proofA, proofB, proofC);
  // await forgeTx.wait();
  // // // const test1 = await zkPayment.test();
  // // // console.log(test1);
  // console.log('forge empty success');

  // //   last idx raw: +35
  // // last state raw: +2602686516262905074029353784952235202453632865710620009990615790554463836422
  // // last exit raw: +0
  // // l1L2TxsData: [0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0]
  // // l1Batch: true
  // // proofA: [+21738672850595101606742558419267344091980237243403337756601242758242495665693 +16550162735879682253117802659930721598680453969922529711769388887874311662656]
  // // proofB: [[+16237618949844194811608673737745760255121876754197648429842878899613600352239 +542409492193994718902401661189944318855387562414349470717913306152805157390] [+7993652642323731786444344390784820402390803220585408578169757083095576730871 +19423655420351713691991955883914979741672575355871832579602118499307883501346]]
  // // proofC: [+17960536298018427306922201606232611323739426613214732679706712594264529406990 +14086810923303282702464310372346888916782843248194061280354311334925890275142]

  // const pi_a = [
  //   '21738672850595101606742558419267344091980237243403337756601242758242495665693',
  //   '16550162735879682253117802659930721598680453969922529711769388887874311662656',
  // ];
  // const pi_b = [
  //   [
  //     '16237618949844194811608673737745760255121876754197648429842878899613600352239',
  //     '542409492193994718902401661189944318855387562414349470717913306152805157390',
  //   ],
  //   [
  //     '7993652642323731786444344390784820402390803220585408578169757083095576730871',
  //     '19423655420351713691991955883914979741672575355871832579602118499307883501346',
  //   ],
  // ];
  // const pi_c = [
  //   '17960536298018427306922201606232611323739426613214732679706712594264529406990',
  //   '14086810923303282702464310372346888916782843248194061280354311334925890275142',
  // ];
  // var forgeTx = await zkPayment.forgeBatch(
  //   35,
  //   '2602686516262905074029353784952235202453632865710620009990615790554463836422',
  //   '0',
  //   '0x00',
  //   '0x0000000000000000000000000000000000000000000000000000000000000000',
  //   '0x00000000',
  //   0,
  //   true,
  //   pi_a,
  //   pi_b,
  //   pi_c
  // );
  // await forgeTx.wait();
  // console.log('success forge batch 1');

  // proofA = [
  //   '8186842255099215140493036869158604239325499510272982633047332837018327148534',
  //   '7218666047530719452361525516490755056702392584552363841383490877143286736889',
  // ];
  // proofB = [
  //   [
  //     '5871471927754041065535918975589425681979284200343663343384422256705622620420',
  //     '3326417123372443541260723474282931798871059124907432426292454513783462588958',
  //   ],
  //   [
  //     '4456187214138311485028531286436002055005860853532083102727573962752226174035',
  //     '15771602487547880503540643058988815899810731054455628059363723216971649520019',
  //   ],
  // ];

  // proofC = [
  //   '7283622811310631227433856558498443672184717348349045675376759105884045363314',
  //   '5073710524677043666260840255035452447178266863186899501032294497345198619498',
  // ];
  // var forgeTx = await zkPayment.forgeBatch(
  //   35,
  //   '2602686516262905074029353784952235202453632865710620009990615790554463836422',
  //   '0',
  //   '0x00',
  //   '0x0000000000000000000000000000000000000000000000000000000000000000',
  //   '0x00000000',
  //   0,
  //   true,
  //   proofA,
  //   proofB,
  //   proofC
  // );
  // await forgeTx.wait();
  // console.log('success forge batch 2');

  // //   proofA: [+13052291272645604241019797391902120722679865139929431879352782634398832131481 +6956394053043597846447525857649972889608413359527287804306774547541041366013]
  // // proofB: [[+7515155852904249735830697802193034602112553578341352485405523058921600123157 +1983538683456336169134049037501688505665661452532987135695185285339864826264] [+17452293096317584060662325116972410968220734327403725356222330008221574787659 +8003656478741462151476017564361091626636468045007575819358743296268784512343]]
  // // proofC: [+14755183414504993171179189617894567822043174621399513717259244464072532543502 +12825835619373594804827953469294655024206793246652129981114007899202835014686]

  // const erc20MockAddressss = erc20Mock;
  // const erc20Mockss = await ethers.getContractAt("MockToken", erc20MockAddressss);
  // const zkPaymentAddressss = zkPayment.address
  // const zkPaymentss = await ethers.getContractAt("ZkPayment", zkPaymentAddressss);
  // const loadAmount = float40.round(ethers.utils.parseUnits("100", 18));
  // await l1UserTxDeposit(loadAmount, 1, 32, accounts[0], zkPaymentss, erc20Mockss);
  // proofA = [
  //   '13052291272645604241019797391902120722679865139929431879352782634398832131481',
  //   '6956394053043597846447525857649972889608413359527287804306774547541041366013',
  // ];
  // proofB = [
  //   [
  //     '7515155852904249735830697802193034602112553578341352485405523058921600123157',
  //     '1983538683456336169134049037501688505665661452532987135695185285339864826264',
  //   ],
  //   [
  //     '17452293096317584060662325116972410968220734327403725356222330008221574787659',
  //     '8003656478741462151476017564361091626636468045007575819358743296268784512343',
  //   ],
  // ];

  // proofC = [
  //   '14755183414504993171179189617894567822043174621399513717259244464072532543502',
  //   '12825835619373594804827953469294655024206793246652129981114007899202835014686',
  // ];
  // var forgeTx = await zkPayment.forgeBatch(
  //   35,
  //   '2602686516262905074029353784952235202453632865710620009990615790554463836422',
  //   '0',
  //   '0x00',
  //   '0x2000000000000000',
  //   '0x00000000',
  //   0,
  //   true,
  //   proofA,
  //   proofB,
  //   proofC
  // );
  // await forgeTx.wait();
  // console.log('success forge batch 3');

  //   last idx raw: +35
  // last state raw: +2602686516262905074029353784952235202453632865710620009990615790554463836422
  // last exit raw: +0
  // l1L2TxsData: []
  // l1Batch: true
  // proofA: [+8186842255099215140493036869158604239325499510272982633047332837018327148534 +7218666047530719452361525516490755056702392584552363841383490877143286736889]
  // proofB: [[+5871471927754041065535918975589425681979284200343663343384422256705622620420 +3326417123372443541260723474282931798871059124907432426292454513783462588958] [+4456187214138311485028531286436002055005860853532083102727573962752226174035 +15771602487547880503540643058988815899810731054455628059363723216971649520019]]
  // proofC: [+7283622811310631227433856558498443672184717348349045675376759105884045363314 +5073710524677043666260840255035452447178266863186899501032294497345198619498]

  // const test = await zkPayment.test();
  // console.log(test);
  // console.log(test.length);

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
