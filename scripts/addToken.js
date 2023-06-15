const { ethers } = require('hardhat')
const { l1TxCreateAccountDeposit } = require('./helpers/helpers')

async function main() {

    const accounts = await ethers.getSigners();
    const initToken = ethers.utils.parseUnits("10000000000000", 18);
    const ERC20MOCK = await ethers.getContractFactory("MockToken");
    const erc20 = await ERC20MOCK.deploy("TEST", "TEST", initToken);
    await erc20.deployed()
    console.log(`erc20 address: ${erc20.address}`);

    const zkPaymentAddress = "0x6a38Ec619c37A04aF3F16354C4e40b64534cE2b6"
    const zkPayment = await ethers.getContractAt("ZkPayment", zkPaymentAddress);
    await zkPayment.deployed()

    var tx = await zkPayment.connect(accounts[0]).addToken(erc20.address);
    await tx.wait()
}

main().then(() => {
    console.log("Success")
}).catch((err) => {
    console.error(err)
})
