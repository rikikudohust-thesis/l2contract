
const { ethers, upgrades, network } = require('hardhat');
async function main() {


  // Deploy L2 contract
  const ZKPAYMENT = await ethers.getContractFactory('ZkPayment');
  let zkPayment;
  const zkPaymentUpgrades = await upgrades.upgradeProxy("0x927b63cC5138b3f5d26e434Bbe861D9D973E27d1",ZKPAYMENT);
  console.log("upgrades successfully")
}

main()