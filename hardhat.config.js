require("dotenv").config();
require("@nomicfoundation/hardhat-toolbox");

const {
  BSC_RPC_URL,
  BSC_TESTNET_RPC_URL,
  DEPLOYER_PRIVATE_KEY
} = process.env;

const accounts = DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [];

module.exports = {
  defaultNetwork: "hardhat",
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    hardhat: {},
    bsc: {
      url: BSC_RPC_URL || "https://bsc-dataseed.binance.org/",
      chainId: 56,
      accounts
    },
    bscTestnet: {
      url: BSC_TESTNET_RPC_URL || "https://data-seed-prebsc-1-s1.binance.org:8545/",
      chainId: 97,
      accounts
    }
  }
};
