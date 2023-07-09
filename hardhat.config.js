require("@nomicfoundation/hardhat-toolbox");
require("@openzeppelin/hardhat-upgrades")
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
            runs: 200,
          },
          viaIR: true,
        },
      },
      {
        version: '0.6.12', settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
          viaIR: true,
        },
      },
      {
        version: '0.7.6', settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
          viaIR: true,
        },
      },
      {
        version: '0.8.19', settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
          viaIR: true,
        }
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
    eth_fork: {
      tags: ['local', 'staging'],
      live: true,
      accounts,
      loggingEnabled: true,
      url: `https://rpc.tenderly.co/fork/3e258fc0-0c6e-442c-aabb-be3bc939d8d3`,
    }, 
    sepolia: {
      tags: ['local', 'staging'],
      live: true,
      accounts,
      loggingEnabled: true,
      url: `https://sepolia.infura.io/v3/a37606efd3c5413dbae3f6736108e0ba`
    },
    arbitrum: {
      tags: ['local', 'staging'],
      live: true,
      accounts,
      loggingEnabled: true,
      url: `https://arbitrum-goerli.blockpi.network/v1/rpc/public`
    }
  },
  mocha: {
    timeout: 200000
  },

};
