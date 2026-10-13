/**
 * 链健康检查 —— 一条 RPC 到底「活没活、全不全」。
 *
 * 为什么需要这个工具：
 *   dApp 出问题时，90% 的人会直接去怀疑前端或合约，然后来回猜几个小时。
 *   正确的排查顺序是**从下往上**：链 → 合约 → 钱包 → 前端。
 *   这个脚本负责第一步 —— 先证明链本身没问题，把嫌疑范围缩小。
 *
 * 检查的都是 JSON-RPC 标准方法，任何以太坊节点都支持，不只 Hardhat。
 * 换成 Sepolia、主网、Alchemy 的节点，这个脚本照样能用（改 RPC_URL 即可）。
 *
 * 用法：
 *   npm run check
 *   RPC_URL=https://sepolia.infura.io/v3/xxx npm run check
 */
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";
const EXPECTED_CHAIN_ID = 31337;

let failures = 0;
const ok = (label, value) => console.log(`  ✅ ${label}：${value}`);
const bad = (label, detail) => {
  failures++;
  console.log(`  ❌ ${label}：${detail}`);
};

(async () => {
  console.log(`\n🔍 链健康检查`);
  console.log(`   目标 : ${RPC_URL}\n`);

  const provider = new ethers.JsonRpcProvider(RPC_URL);

  // ① 连得上吗 —— 连不上后面全都白搭，直接退出
  let network;
  try {
    network = await provider.getNetwork();
  } catch (err) {
    bad("连接", `连不上 —— ${err.shortMessage || err.message}`);
    console.log(`\n  👉 链没在跑？先执行： npm run node\n`);
    process.exit(1);
  }
  ok("连接", "通");

  // ② 节点客户端 —— 一眼看出你连的是什么东西
  const clientVersion = await provider.send("web3_clientVersion", []);
  ok("客户端", clientVersion);

  // ③ 链 ID —— MetaMask 里填的就是这个，对不上就必然显示 0 余额
  const chainId = Number(network.chainId);
  const netVersion = await provider.send("net_version", []);
  if (chainId === EXPECTED_CHAIN_ID) {
    ok("链 ID", `${chainId}（和 MetaMask 里填的一致）`);
  } else {
    bad("链 ID", `是 ${chainId}，但本项目需要 ${EXPECTED_CHAIN_ID}`);
  }
  ok("net_version", netVersion);

  // ④ 出块了没 —— 链在跑但一笔交易都没发过的话，这里会是 0
  const blockNumber = await provider.getBlockNumber();
  ok("区块高度", blockNumber);

  // ⑤ 测试账户 —— Hardhat 固定给 20 个，每个 10000 ETH
  const accounts = await provider.send("eth_accounts", []);
  if (accounts.length > 0) {
    ok("账户数量", `${accounts.length} 个`);
  } else {
    bad("账户数量", "0 个（这不是一条开发链？）");
  }

  // ⑥ 同步状态 —— 本地链永远是 false。主网节点刚启动时会是 true
  const syncing = await provider.send("eth_syncing", []);
  ok("同步状态", syncing === false ? "false（已同步完）" : "true（正在同步）");

  // ⑦ 余额 —— 直接查用户钱包里到底有多少钱
  console.log(`\n  💰 账户余额：`);
  for (const addr of accounts.slice(0, 3)) {
    const bal = await provider.getBalance(addr);
    console.log(`     ${addr}  ${ethers.formatEther(bal)} ETH`);
  }

  // ⑧ 最关键的一步：部署的合约**到底存不存在**
  //
  //    这一步最容易漏。合约地址不像网站，写错了不会报 404，
  //    它只是返回一段空代码 "0x"，然后你调用任何方法都会失败得莫名其妙。
  //    有了这个检查，就能立刻分清是「合约没部署」还是「别的问题」。
  //
  //    顺便说：这也是为什么前端必须读 contracts.js ——
  //    地址对不上时，你能在这里一秒发现。
  const deploymentPath = path.join(__dirname, "..", "frontend", "deployment.json");
  console.log(`\n  📄 已部署合约（读自 frontend/deployment.json）：`);
  if (!fs.existsSync(deploymentPath)) {
    bad("deployment.json", "不存在 —— 先跑 npm run deploy");
  } else {
    const dep = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));

    if (Number(dep.chainId) !== chainId) {
      bad("部署记录", `记录的是链 ${dep.chainId}，当前链是 ${chainId} —— 换链了，必须重新部署`);
    }

    for (const [name, address] of [
      ["LearningToken", dep.token],
      ["Guestbook    ", dep.guestbook],
    ]) {
      const code = await provider.getCode(address);
      if (code === "0x") {
        bad(name, `${address} 上没有代码 —— 合约不存在！重新跑 npm run deploy`);
      } else {
        ok(name, `${address}  （代码 ${(code.length - 2) / 2} 字节）`);
      }
    }
  }

  // 结论
  console.log("");
  if (failures === 0) {
    console.log("🎉 全部通过 —— 链和合约都没问题。");
    console.log("   如果 dApp 还是连不上，问题在钱包（MetaMask 的网络/账户）或前端，不在链这边。\n");
  } else {
    console.log(`⚠️  有 ${failures} 项没通过，看上面的 ❌。\n`);
    process.exit(1);
  }
})();
