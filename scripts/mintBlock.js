const {ethers} = require('hardhat')


async function main() {
    const MINTBLOCK = await ethers.getContractFactory("MintBlock");
    const mintBlock = await MINTBLOCK.deploy()
    await mintBlock.deployed()

    console.log("Mint Block contract : ", mintBlock.address)
}

main().then()
.catch((err) => {
    console.error(err)
})