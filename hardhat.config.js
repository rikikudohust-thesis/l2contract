require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config()

/** @type import('hardhat/config').HardhatUserConfig */

const INFURA_API_KEY = process.env.INFURA_API_KEY;
const MNEMONIC = process.env.MNEMONIC;
const ACCOUNTS = 10
const accounts = { mnemonic: process.env.MNEMONIC || 'test test test test test test test test test test test junk' }

module.exports = {
  solidity: {
    compilers: [
      {
        version: '0.5.16', settings: {
          optimizer: {
            enabled: true,
            runs: 999999,
          },
        },
      },
      {
        version: '0.6.12', settings: {
          optimizer: {
            enabled: true,
            runs: 999999,
          },
        },
      },
      {
        version: '0.7.6', settings: {
          optimizer: {
            enabled: true,
            runs: 999999,
          },
        },
      },
      {
        version: '0.8.0', settings: {
          optimizer: {
            enabled: true,
            runs: 999999,
          },
        },
      }
    ]
  },
  networks: {
    hardhat: {
      tags: process.env.DEFAULT_TAG ? process.env.DEFAULT_TAG.split(',') : ['local'],
      live: false,
      saveDeployments: false,
      allowUnlimitedContractSize: false,
      chainId: 1,
      accounts,
    },
    localhost: {
      tags: ['local'],
      live: false,
      saveDeployments: false,
      url: 'http://localhost:8545',
      accounts,
      timeout: 60000,
    },
    bsctestnet: {
      tags: ['local', 'staging'],
      live: true,
      saveDeployments: true,
      accounts,
      loggingEnabled: true,
      url: `https://data-seed-prebsc-1-s2.binance.org:8545`,
    },
  },
  mocha: {
    timeout: 200000
  },

};
