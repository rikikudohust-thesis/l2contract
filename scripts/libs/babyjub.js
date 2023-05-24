const { buildBabyjub, buildEddsa } = require('circomlibjs')
const { ethers } = require('hardhat')
const {EIP_712_PROVIDER, EIP_712_VERSION, chainId} = require('../config/constant')

async function test() {
    const eddsa = await buildEddsa()
    const babyJub = await buildBabyjub()
}

class Wallet {
    constructor(privateKey, etherAddress, eddsa) {
        if (privateKey.length !== 32) {
            throw new Error('Private key buffer must be 32 bytes')
        }

        this.eddsa = eddsa;
        const publicKey = eddsa.prv2pub(privateKey)
        this.privateKey = privateKey
        this.publicKeyHex = [publicKey[0].toString(16), publicKey[1].toString(16)]

        this.bjjCompress = eddsa.babyJub.packPoint(publicKey)
        const compressedPublicKey = ethers.utils.hexValue(this.bjjCompress)
        this.publicKeyCompressed = compressedPublicKey.toString()
        // this.publicKeyCompressedHex = ethers.utils.hexZeroPad(`0x${compressedPublicKey.toString(16)}`, 32).slice(2)

        this.etherAddress = etherAddress
    }

    /**
     * To sign transaction with babyjubjub keys
     * @param {Object} transaction - Transaction object
     * @param {Object} encodedTransaction - Transaction encoded object
     * @returns {Object} The signed transaction object
     */
    // async signTransaction(transaction, encodedTransaction) {
    //     const hashMessage = buildTransactionHashMessage(encodedTransaction)
    //     const signature = circomlib.eddsa.signPoseidon(this.privateKey, hashMessage)
    //     const packedSignature = circomlib.eddsa.packSignature(signature)
    //     transaction.signature = packedSignature.toString('hex')
    //     return transaction
    // }

    /**
     * Generates the signature necessary for /create-account-authorization endpoint
     * @param {String} providerUrl - Network url (i.e, http://localhost:8545). Optional
     * @param {Object} signerData - Signer data used to build a Signer to create the walet
     * @returns {String} The generated signature
     */
    // async signCreateAccountAuthorization(providerUrl, signerData) {
    //     const provider = getProvider(providerUrl)
    //     const signer = getSigner(provider, signerData)
    //     const chainId = (await provider.getNetwork()).chainId
    //     const bJJ = this.bjjCompress

    //     const domain = {
    //         name: EIP_712_PROVIDER,
    //         version: EIP_712_VERSION,
    //         chainId,
    //         verifyingContract: CONTRACT_ADDRESSES[ContractNames.Hermez]
    //     }
    //     const types = {
    //         Authorise: [
    //             { name: 'Provider', type: 'string' },
    //             { name: 'Authorisation', type: 'string' },
    //             { name: 'BJJKey', type: 'bytes32' }
    //         ]
    //     }
    //     const value = {
    //         Provider: EIP_712_PROVIDER,
    //         Authorisation: CREATE_ACCOUNT_AUTH_MESSAGE,
    //         BJJKey: bJJ.reverse()
    //     }

    //     return signer._signTypedData(domain, types, value)
    // }
}

/**
 * Creates a HermezWallet from one of the Ethereum wallets in the provider
 * @param {String} providerUrl - Network url (i.e, http://localhost:8545). Optional
 * @param {Object} signerData - Signer data used to build a Signer to create the walet
 * @returns {Object} Contains the `hermezWallet` as a HermezWallet instance and the `hermezEthereumAddress`
 */
// async function createWalletFromEtherAccount(providerUrl, signerData) {
//     const provider = getProvider(providerUrl)
//     const signer = getSigner(provider, signerData)
//     const ethereumAddress = await signer.getAddress()
//     const hermezEthereumAddress = getHermezAddress(ethereumAddress)
//     const signature = await signer.signMessage(METAMASK_MESSAGE)
//     const hashedSignature = jsSha3.keccak256(signature)
//     const bufferSignature = hexToBuffer(hashedSignature)
//     const hermezWallet = new HermezWallet(bufferSignature, hermezEthereumAddress)

//     return { hermezWallet, hermezEthereumAddress }
// }

/**
 * Creates a HermezWallet from Babyjubjub private key
 * This creates a wallet for an internal account
 * An internal account has a Babyjubjub key and Ethereum account 0xFFFF...FFFF
 * Random wallet is created if no private key is provided
 * @param {Buffer} privateKey - 32 bytes buffer
 * @returns {Object} Contains the `hermezWallet` as a HermezWallet instance and the `hermezEthereumAddress`
 */
async function createWalletFromBjjPvtKey(privateKey, ethereumAddress) {
    const eddsa = await buildEddsa()
    const privateBjjKey = privateKey || Buffer.from(getRandomBytes(32))
    const wallet = new Wallet(privateBjjKey, ethereumAddress, eddsa)

    return wallet
}

module.exports = {createWalletFromBjjPvtKey}

