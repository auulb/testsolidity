const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

/**
 * 部署 = 把编译好的合约字节码，作为一笔交易发到链上，链上生成一个永久地址。
 *
 * 关键认知：部署本身也是一笔交易，要付 gas。而且合约一旦部署就改不了了
 * （除非你提前写了代理升级模式）—— 所以行业里说 "code is law"，
 * 上线前必须审计、必须有测试，就是这个原因。
 */
async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const network = hre.network.name;

  console.log("\n🚀 开始部署");
  console.log("   网络      :", network);
  console.log("   部署者    :", deployer.address);
  console.log(
    "   部署者余额:",
    hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address)),
    "ETH"
  );

  // ---------- 1. 部署代币 ----------
  const initialSupply = hre.ethers.parseEther("1000000"); // 100 万枚
  const Token = await hre.ethers.getContractFactory("LearningToken");
  const token = await Token.deploy(initialSupply);
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();

  console.log("\n✅ LearningToken 已部署");
  console.log("   地址       :", tokenAddress);
  console.log("   初始供应量 :", hre.ethers.formatEther(initialSupply), "LEARN");

  // ---------- 2. 部署留言板，把代币地址传进去 ----------
  const Guestbook = await hre.ethers.getContractFactory("Guestbook");
  const guestbook = await Guestbook.deploy(tokenAddress);
  await guestbook.waitForDeployment();
  const guestbookAddress = await guestbook.getAddress();

  console.log("\n✅ Guestbook 已部署");
  console.log("   地址       :", guestbookAddress);
  console.log("   收费代币   :", tokenAddress, "(1 LEARN / 条)");

  // ---------- 3. 导出地址和 ABI 给前端用 ----------
  // 前端(浏览器里的 ethers.js)需要两样东西才能跟合约对话：
  //   ABI    —— 合约的"说明书"，告诉 ethers 每个函数长什么样
  //   address—— 合约在链上的门牌号
  const frontendDir = path.join(__dirname, "..", "frontend");
  fs.mkdirSync(frontendDir, { recursive: true });

  const artifact = (name) =>
    hre.artifacts.readArtifactSync(name).abi;

  const output = `// 这个文件由 scripts/deploy.js 自动生成，不要手动改。
// 每次重新部署（尤其是重启本地链之后），地址都会变，记得重新跑一次 npm run deploy。
window.CONTRACTS = {
  chainId: ${hre.network.config.chainId || 31337},
  token: {
    address: ${JSON.stringify(tokenAddress)},
    abi: ${JSON.stringify(artifact("LearningToken"), null, 2)},
  },
  guestbook: {
    address: ${JSON.stringify(guestbookAddress)},
    abi: ${JSON.stringify(artifact("Guestbook"), null, 2)},
  },
};
`;

  fs.writeFileSync(path.join(frontendDir, "contracts.js"), output);

  // 再写一份纯 JSON，给命令行脚本读。
  // 让脚本去正则解析 JS 文件是自找麻烦，输出结构化数据才是正路。
  fs.writeFileSync(
    path.join(frontendDir, "deployment.json"),
    JSON.stringify(
      {
        network,
        chainId: hre.network.config.chainId || 31337,
        token: tokenAddress,
        guestbook: guestbookAddress,
        deployer: deployer.address,
        deployedAt: new Date().toISOString(),
      },
      null,
      2
    )
  );

  console.log("\n📦 已生成 frontend/contracts.js 和 frontend/deployment.json");

  console.log("\n🎉 部署完成！下一步：");
  if (network === "localhost") {
    console.log("   1) 保持 `npm run node` 那个终端开着");
    console.log("   2) 另开终端跑 `npm run demo`    看命令行交互演示");
    console.log("   3) 再开一个跑 `npm run frontend` 然后浏览器打开 http://localhost:3000");
  } else {
    console.log("   接下来跑 `npm run node`，再 `npm run deploy`");
  }
  console.log("");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
