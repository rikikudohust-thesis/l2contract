const {HermezWallet, Addresses,TxUtils} = require('./utils/hermezjs')
const {ethers} = require('ethers')

function main() {
    const prvkey = "0000000000000000000000000000000000000000000000000000000000000001"
    const prvkeyBuf = Buffer.from(prvkey, 'hex');
    const ethAddr = "0x693C4171D99ba75E877f536e1c830D76EF1fd4AF"
    const hezEth =  Addresses.getHermezAddress(ethAddr)
    const wallet =  new HermezWallet.HermezWallet(prvkeyBuf, hezEth);
    // wallet.publicKeyBase64
    console.log("wallet: ",wallet)
    const tx = {
        chainId: 1,
        fromAccountIndex: 32,
        toAccountIndex: 35,
        tokenId: 1,
        nonce: 0,
        amount: ethers.utils.parseUnits("100", 18).toString(),
    }

    const signature = wallet.signTransaction(tx, tx)
    console.log("sign: ", signature)

}

main()