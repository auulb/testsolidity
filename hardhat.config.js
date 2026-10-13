require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-chai-matchers");
require("@nomicfoundation/hardhat-network-helpers");

/** @type {import('hardhat/config').HardhatUserConfig} */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },

  networks: {
    // 内存里的临时链，跑测试用。进程一停，链就没了，最干净。
    hardhat: {
      chainId: 31337,
    },

    // 本地持久链：`npm run node` 启动，MetaMask 连这个。
    // 这里的账户是 Hardhat 公开的测试助记词，全世界都知道它的私钥，
    // 里面没钱，只用于本地开发 —— 千万别往上面转真钱。
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },
  },
};
