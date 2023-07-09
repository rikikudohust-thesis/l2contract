const { ethers } = require('hardhat')
const {HermezWallet, Addresses} = require('./hermezjs')

function generateAccount(privateKeys, ethereumAccounts) {

    let accounts = []
    for (let i = 0; i < privateKeys.length; i++) {
        const hexPrv = ethers.utils.hexZeroPad(`0x${privateKeys[i].toString(16)}`, 32)
        console.log(hexPrv.slice(2))
        const prvBuf = Buffer.from(hexPrv.slice(2), 'hex')
        const hezEth =  Addresses.getHermezAddress(ethereumAccounts[i])
        const account = new HermezWallet.HermezWallet(prvBuf, hezEth)
        accounts.push(account)
    }
    return accounts
}

module.exports = {generateAccount}