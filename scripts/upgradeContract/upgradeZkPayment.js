
const { ethers, upgrades, network } = require('hardhat');
async function main() {


  // Deploy L2 contract
  const ZKPAYMENT = await ethers.getContractFactory('ZkPayment');
  let zkPayment;
  const zkPaymentUpgrades = await upgrades.upgradeProxy("0x7E6b170c6639B268a49FD383bdB93EE0A0E39620",ZKPAYMENT);
  console.log("upgrades successfully")
}

main()