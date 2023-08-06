const { ethers, network } = require('hardhat');

const EIP_712_PROVIDER = 'ZKPayment Network';
const CREATE_ACCOUNT_AUTH_MESSAGE = 'Account creation';
const WITHDRAW_MESSAGE = 'Withdraw';
const EIP_712_VERSION = '1';

async function signCreateAccountAuthorization(signer, bJJ, address) {
  const chainId = 1;

  const domain = {
    name: EIP_712_PROVIDER,
    version: EIP_712_VERSION,
    chainId,
    verifyingContract: address,
  };
  const types = {
    Authorise: [
      { name: 'Provider', type: 'string' },
      { name: 'Authorisation', type: 'string' },
      { name: 'BJJKey', type: 'bytes32' },
    ],
  };
  const value = {
    Provider: EIP_712_PROVIDER,
    Authorisation: CREATE_ACCOUNT_AUTH_MESSAGE,
    BJJKey: bJJ,
  };
  const signature = await signer._signTypedData(domain, types, value);
  console.log(
    ethers.utils.keccak256(ethers.utils.toUtf8Bytes('Authorise(string Provider,string Authorisation,bytes32 BJJKey)'))
  );

  return signature;
}

async function signWithdraw(signer, bJJ, receiver, address) {
  const chainId = 1;

  const domain = {
    name: EIP_712_PROVIDER,
    version: EIP_712_VERSION,
    chainId,
    verifyingContract: address,
  };
  const types = {
    Authorise: [
      { name: 'Provider', type: 'string' },
      { name: 'Authorisation', type: 'string' },
      { name: 'BJJKey', type: 'bytes32' },
      { name: 'EthAddr', type: 'address' },
    ],
  };
  const value = {
    Provider: EIP_712_PROVIDER,
    Authorisation: WITHDRAW_MESSAGE,
    BJJKey: bJJ,
    EthAddr: receiver,
  };
  const signature = await signer._signTypedData(domain, types, value);
  console.log(ethers.utils.keccak256(ethers.utils.toUtf8Bytes('Authorise(string Provider,string Authorisation,bytes32 BJJKey,address EthAddr)')));

  return signature;
}

// async function main() {
//   const providerUrl = network.config.url
//   const accounts = await ethers.getSigners()
//   const signer = accounts[0]
//   const bjj  = `0x8bcde65e2937b60284cd4ad771dde597c0d3a867c27ff5ad08817460c845499e`
// }

// main();

module.exports = {
  signCreateAccountAuthorization,
  signWithdraw,
};
