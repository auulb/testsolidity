/**
 * 前端逻辑：浏览器里跟区块链打交道。
 *
 * 和传统 Web 开发最大的不同 ——
 *   传统：前端调后端 API，后端改数据库，改完就完了。
 *   Web3：前端不调后端，直接把"交易"交给用户的 MetaMask，
 *        用户签名确认后，交易广播到全网，矿工打包上链。
 *        没有服务器，没有管理员，状态改了就永久定格。
 *
 * 所以你会看到这个流程里反复出现三件事：
 *   1. 读数据（view 函数）—— 免费、瞬间返回、不需要签名
 *   2. 写数据（转账/留言）—— 要签名、要花 gas、要等几秒上链
 *   3. 授权（approve）—— 让合约有权动你的代币，这是 ERC-20 的规矩
 */

// 从 deploy.js 生成的 contracts.js 里拿地址和 ABI
const CFG = window.CONTRACTS;
const EXPECTED_CHAIN_ID = CFG.chainId; // 31337

// 全局状态
let provider;      // 只读连接
let signer;        // 可签名连接（能发交易）
let token;         // 代币合约实例
let guestbook;     // 留言板合约实例
let myAddress;     // 当前钱包地址
let refreshTimer;

// ---------- DOM 快捷方式 ----------
const $ = (id) => document.getElementById(id);
const show = (id) => $(id).classList.remove("hidden");
const hide = (id) => $(id).classList.add("hidden");

// ---------- 交易日志 ----------
function log(message, kind = "info") {
  show("log-card");
  const el = document.createElement("div");
  el.className = `log-entry ${kind}`;
  const now = new Date().toLocaleTimeString();
  el.innerHTML = `<span class="t">${now}</span><span class="m"></span>`;
  el.querySelector(".m").textContent = message;
  $("log").prepend(el);
}

// ---------- 启动 ----------
window.addEventListener("DOMContentLoaded", async () => {
  // 页面上先显示合约地址，方便你去区块浏览器核对
  $("contract-info").innerHTML =
    `代币 <code>${short(CFG.token.address)}</code> · ` +
    `留言板 <code>${short(CFG.guestbook.address)}</code>`;

  if (!window.ethereum) {
    show("no-wallet");
    hide("connect-card");
    return;
  }

  $("btn-connect").onclick = connect;
  $("btn-refresh").onclick = () => refreshAll(true);
  $("btn-faucet").onclick = claimFaucet;
  $("btn-post").onclick = postMessage;

  $("message-input").addEventListener("input", (e) => {
    $("char-count").textContent = `${e.target.value.length} / 200`;
  });

  // 用户在 MetaMask 里换了账号或网络 —— 必须跟着重新加载，否则会读到错的链
  window.ethereum.on("accountsChanged", () => location.reload());
  window.ethereum.on("chainChanged", () => location.reload());

  // 如果之前已经授权过这个网站，直接自动连上
  const accounts = await window.ethereum.request({ method: "eth_accounts" });
  if (accounts.length > 0) await connect();
});

/**
 * 连接钱包。
 * eth_requestAccounts 会弹出 MetaMask 让你点"确认" —— 这一步不花 gas，也不上链，
 * 只是把你的地址告诉网页。真正花钱的是后面发交易的时候。
 */
async function connect() {
  try {
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    myAddress = accounts[0];

    provider = new ethers.BrowserProvider(window.ethereum);

    // 检查网络对不对。连错链是新手最隐蔽的 bug：合约地址在另一条链上是空的。
    const network = await provider.getNetwork();
    if (Number(network.chainId) !== EXPECTED_CHAIN_ID) {
      log(`网络不对：当前 ${network.chainId}，需要 ${EXPECTED_CHAIN_ID}。请手动切换，或点 MetaMask 提示里的"切换网络"。`, "err");
      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: "0x" + EXPECTED_CHAIN_ID.toString(16) }],
        });
        return location.reload();
      } catch {
        alert(
          `请手动在 MetaMask 里添加网络：\n\n` +
            `网络名：Localhost 31337\nRPC URL：http://127.0.0.1:8545\n` +
            `Chain ID：${EXPECTED_CHAIN_ID}\n货币符号：ETH`
        );
        return;
      }
    }

    signer = await provider.getSigner();

    // 用地址 + ABI 创建合约实例。有了它就能像调普通对象一样调链上函数。
    token = new ethers.Contract(CFG.token.address, CFG.token.abi, signer);
    guestbook = new ethers.Contract(CFG.guestbook.address, CFG.guestbook.abi, signer);

    hide("connect-card");
    show("dashboard");

    log(`钱包已连接：${myAddress}`, "ok");
    await refreshAll();

    // 监听链上事件：别人留言，我这边立刻看到（不用刷新页面）
    // 这就是"事件驱动"的 Web3 前端，比轮询高效得多。
    guestbook.on("NewMessage", (author, content) => {
      log(`🔔 链上广播：${short(author)} 留言了「${content}」`, "info");
      loadMessages();
    });

    // 每 15 秒刷新一次余额和倒计时
    clearInterval(refreshTimer);
    refreshTimer = setInterval(() => refreshAll(), 15000);
  } catch (err) {
    log(`连接失败：${err.shortMessage || err.message}`, "err");
  }
}

/** 刷新余额、授权额度、留言列表。 */
async function refreshAll(manual = false) {
  if (!signer) return;
  try {
    const [ethBalance, learnBalance, allowance, network] = await Promise.all([
      provider.getBalance(myAddress),
      token.balanceOf(myAddress),
      token.allowance(myAddress, CFG.guestbook.address),
      provider.getNetwork(),
    ]);

    $("my-address").textContent = myAddress;
    $("my-network").textContent = `chainId ${network.chainId}`;
    $("my-eth").textContent = `${round(ethers.formatEther(ethBalance))} ETH`;
    $("my-learn").textContent = `${round(ethers.formatEther(learnBalance))} LEARN`;
    $("my-allowance").textContent = `${round(ethers.formatEther(allowance))} LEARN`;

    updateFaucetStatus();
    await loadMessages();
    if (manual) log("已刷新", "info");
  } catch (err) {
    log(`刷新失败：${err.shortMessage || err.message}`, "err");
  }
}

/** 更新水龙头按钮的可用状态和倒计时。 */
async function updateFaucetStatus() {
  const btn = $("btn-faucet");
  const status = $("faucet-status");

  try {
    const secondsLeft = Number(await token.secondsUntilNextClaim(myAddress));
    if (secondsLeft > 0) {
      btn.disabled = true;
      status.textContent = `⏳ 冷却中，还需等待 ${formatDuration(secondsLeft)}`;
    } else {
      btn.disabled = false;
      status.textContent = "✅ 可以领取";
    }
  } catch {
    btn.disabled = false;
    status.textContent = "-";
  }
}

/**
 * 领代币。这是一笔"写交易"：
 *   构造交易 → 弹 MetaMask 让你签名 → 广播到网络 → 等矿工打包 → 状态更新
 * 全过程通常几秒到几十秒。所以下面的按钮会 disable 掉，防止你重复点击发出多笔交易。
 */
async function claimFaucet() {
  const btn = $("btn-faucet");
  btn.disabled = true;
  try {
    log("发起交易：faucet()，请在 MetaMask 里确认…", "pending");

    const tx = await token.faucet();
    log(`交易已广播：${short(tx.hash)}，等待打包…`, "pending");

    const receipt = await tx.wait(); // 等这笔交易被矿工打包进区块
    log(`✅ 上链成功！区块 #${receipt.blockNumber}，gas 用了 ${receipt.gasUsed}`, "ok");

    await refreshAll();
  } catch (err) {
    log(`失败：${err.shortMessage || err.reason || err.message}`, "err");
    await updateFaucetStatus();
  }
}

/**
 * 付费留言 —— 这里演示 ERC-20 最核心的 approve / transferFrom 机制。
 *
 * 为什么不能一步到位？
 *   因为合约无权直接动你钱包里的代币。你必须先"授权"它最多能拿多少，
 *   它才能在你的许可范围内把钱划走。这是安全设计：就算合约有 bug，
 *   它也最多只能拿走你授权的那点额度。
 */
async function postMessage() {
  const input = $("message-input");
  const content = input.value.trim();

  if (!content) return alert("留言不能为空");
  if (content.length > 200) return alert("留言最多 200 字");

  const btn = $("btn-post");
  btn.disabled = true;

  try {
    const need = ethers.parseEther("1");

    // 1) 先查余额够不够 —— 本地先拦一道，省得白花 gas
    const balance = await token.balanceOf(myAddress);
    if (balance < need) {
      throw new Error("LEARN 余额不足，先去上面领币");
    }

    // 2) 查授权额度够不够，不够就先 approve
    const allowance = await token.allowance(myAddress, CFG.guestbook.address);
    if (allowance < need) {
      log("第 1 步：授权留言板使用 1 LEARN，请在 MetaMask 确认…", "pending");
      const approveTx = await token.approve(CFG.guestbook.address, need);
      log(`授权交易已广播：${short(approveTx.hash)}`, "pending");
      await approveTx.wait();
      log("✅ 授权成功", "ok");
    } else {
      log(`已有 ${round(ethers.formatEther(allowance))} LEARN 授权额度，跳过授权步骤`, "info");
    }

    // 3) 再调用 post，合约会用 transferFrom 把 1 LEARN 划走
    log("第 2 步：发送留言，请在 MetaMask 确认…", "pending");
    const tx = await guestbook.post(content);
    log(`留言交易已广播：${short(tx.hash)}，等待打包…`, "pending");

    const receipt = await tx.wait();
    log(`✅ 留言上链成功！区块 #${receipt.blockNumber}，gas 用了 ${receipt.gasUsed}`, "ok");

    input.value = "";
    $("char-count").textContent = "0 / 200";
    await refreshAll();
  } catch (err) {
    log(`失败：${err.shortMessage || err.reason || err.message}`, "err");
  } finally {
    btn.disabled = false;
  }
}

/** 读取所有留言并渲染。这是 view 调用 —— 免费、不用签名。 */
async function loadMessages() {
  const container = $("messages");
  try {
    const messages = await guestbook.getAllMessages();

    if (messages.length === 0) {
      container.innerHTML = '<p class="empty">还没有人留言，来当第一个吧。</p>';
      return;
    }

    // 链上是正序存的，展示时倒过来，最新的在上面
    container.innerHTML = [...messages]
      .reverse()
      .map((m) => {
        const time = new Date(Number(m.timestamp) * 1000).toLocaleString();
        const isMe = m.author.toLowerCase() === myAddress.toLowerCase();
        return `
          <div class="msg">
            <div class="content"></div>
            <div class="meta">${isMe ? "我" : short(m.author)} · ${time}</div>
          </div>`;
      })
      .join("");

    // 用 textContent 填内容，绝不用 innerHTML —— 用户输入直接插进 HTML 会造成 XSS
    container.querySelectorAll(".msg .content").forEach((el, i) => {
      el.textContent = [...messages].reverse()[i].content;
    });
  } catch (err) {
    container.innerHTML = `<p class="empty">读取失败：${err.shortMessage || err.message}</p>`;
  }
}

// ---------- 小工具 ----------
const short = (addr) => `${addr.slice(0, 6)}…${addr.slice(-4)}`;

function round(value) {
  const n = Number(value);
  if (n === 0) return "0";
  return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h} 小时 ${m} 分`;
  if (m > 0) return `${m} 分 ${s} 秒`;
  return `${s} 秒`;
}
