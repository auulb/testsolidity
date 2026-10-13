const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

/**
 * 命令行交互演示：不打开浏览器，也能把整个业务流程走一遍。
 *
 * 这个脚本存在的意义：让你把"链上交易"这件事看得清清楚楚 ——
 * 每一步花了多少 gas、状态怎么变、事件长什么样。
 * 前端会把这些细节藏起来，但作为开发者你必须见过它们。
 */

/** 从 deploy.js 生成的 deployment.json 里读回合约地址。 */
function loadDeployedAddresses() {
  const file = path.join(__dirname, "..", "frontend", "deployment.json");
  if (!fs.existsSync(file)) {
    throw new Error("找不到 frontend/deployment.json，请先运行 `npm run deploy`");
  }

  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!data.token || !data.guestbook) {
    throw new Error("deployment.json 里没有合约地址，请重新运行 `npm run deploy`");
  }
  return { tokenAddress: data.token, guestbookAddress: data.guestbook };
}

/**
 * 打印一笔交易的结果：交易哈希、gas 消耗、触发了哪些事件。
 * @param contract 用来解析事件的合约实例（ethers 需要它把原始日志翻译成人能读的事件）
 */
async function showTx(label, txPromise, contract) {
  const tx = await txPromise;
  const receipt = await tx.wait();

  console.log(`   ↳ ${label}`);
  console.log(`     交易哈希 : ${receipt.hash}`);
  console.log(`     区块高度 : ${receipt.blockNumber}`);
  console.log(`     gas 消耗 : ${receipt.gasUsed.toString()}`);

  for (const log of receipt.logs) {
    try {
      const parsed = contract.interface.parseLog({ topics: [...log.topics], data: log.data });
      if (parsed) {
        console.log(`     事件     : ${parsed.name}(${parsed.args.map(String).join(", ")})`);
      }
    } catch {
      /* 这条日志不是该合约发出的，跳过 */
    }
  }
  return receipt;
}

async function main() {
  const { tokenAddress, guestbookAddress } = loadDeployedAddresses();
  const [deployer, alice, bob] = await hre.ethers.getSigners();

  const token = await hre.ethers.getContractAt("LearningToken", tokenAddress);
  const guestbook = await hre.ethers.getContractAt("Guestbook", guestbookAddress);

  const fmt = hre.ethers.formatEther;
  const line = (t) => console.log(`\n${"─".repeat(60)}\n${t}\n${"─".repeat(60)}`);

  line("🔍 第 0 步：读链上状态（view 函数不花 gas，因为只读不改）");
  console.log("   代币名称     :", await token.name(), `(${await token.symbol()})`);
  console.log("   代币总供应量 :", fmt(await token.totalSupply()), "LEARN");
  console.log("   留言总数     :", (await guestbook.totalMessages()).toString());
  console.log("   当前区块高度 :", await hre.ethers.provider.getBlockNumber());

  line("🚰 第 1 步：alice 从水龙头领 10 枚 LEARN（这是一笔写交易，要花 gas）");
  console.log("   领取前余额 :", fmt(await token.balanceOf(alice.address)), "LEARN");
  await showTx("alice.faucet()", token.connect(alice).faucet(), token);
  console.log("   领取后余额 :", fmt(await token.balanceOf(alice.address)), "LEARN");

  line("⚠️  第 2 步：alice 直接留言 —— 会失败，因为还没 approve");
  try {
    await (await guestbook.connect(alice).post("试试直接留言")).wait();
    console.log("   意外成功了（不该发生）");
  } catch (e) {
    console.log("   ✅ 如预期回滚:", e.shortMessage || e.message);
    console.log("   回滚原因：代币合约抛出了 ERC20InsufficientAllowance 自定义错误");
    console.log("   💡 教训 1：approve 是 ERC-20 的必备前置步骤，忘了就得白付 gas");
    console.log("   💡 教训 2：交易回滚会撤销状态，但已经消耗的 gas 不退 —— 这是真金白银");
  }

  line("✍️  第 3 步：alice 先 approve 授权 1 枚，再留言");
  await showTx(
    "alice.approve(guestbook, 1 LEARN)",
    token.connect(alice).approve(guestbookAddress, hre.ethers.parseEther("1")),
    token
  );
  console.log(
    "   授权额度现在剩 :",
    fmt(await token.allowance(alice.address, guestbookAddress)),
    "LEARN"
  );

  await showTx(
    'alice.post("你好，链上世界！")',
    guestbook.connect(alice).post("你好，链上世界！"),
    guestbook
  );
  console.log("   alice 余额   :", fmt(await token.balanceOf(alice.address)), "LEARN");
  console.log(
    "   合约收入余额 :",
    fmt(await token.balanceOf(guestbookAddress)),
    "LEARN"
  );

  line("👥 第 4 步：bob 也来留言，看多条留言怎么存");
  await token.connect(bob).faucet();
  await token.connect(bob).approve(guestbookAddress, hre.ethers.parseEther("1"));
  await showTx(
    'bob.post("新人报到，请多关照")',
    guestbook.connect(bob).post("新人报到，请多关照"),
    guestbook
  );

  line("📖 第 5 步：读取全部留言（链上数据公开，谁都能读）");
  const messages = await guestbook.getAllMessages();
  messages.forEach((m, i) => {
    const when = new Date(Number(m.timestamp) * 1000).toLocaleString();
    console.log(`   [${i}] ${m.author}`);
    console.log(`       "${m.content}"   @ ${when}`);
  });

  line("💰 第 6 步：项目方（deployer）提走合约赚到的手续费");
  console.log(
    "   提现前 deployer 余额:",
    fmt(await token.balanceOf(deployer.address)),
    "LEARN"
  );
  await showTx(
    "guestbook.withdrawFees(deployer)",
    guestbook.withdrawFees(deployer.address),
    guestbook
  );
  console.log(
    "   提现后 deployer 余额:",
    fmt(await token.balanceOf(deployer.address)),
    "LEARN"
  );
  console.log(
    "   合约里剩余         :",
    fmt(await token.balanceOf(guestbookAddress)),
    "LEARN"
  );

  line("🎉 全流程跑通！");
  console.log("   你刚刚完成了：发行代币 → 领币 → 授权 → 付费调用 → 读链上状态 → 提取收入");
  console.log("   这六个动作，就是加密行业 90% 的产品在干的事。\n");
}

main().catch((error) => {
  console.error("\n❌ 出错了:", error.shortMessage || error.message);
  if (String(error.message).includes("could not detect network")) {
    console.error("   → 本地链没启动，先跑 `npm run node`");
  }
  process.exitCode = 1;
});
