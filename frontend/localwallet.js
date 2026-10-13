/**
 * 内置开发钱包 —— 不用 MetaMask 也能玩这个 dApp。
 *
 * ─────────────────────────────────────────────────────────────
 * 【这个文件在干什么】
 *
 * MetaMask 看起来神秘，本质就三件事：
 *
 *   1. 保管一个私钥
 *   2. 用私钥对交易签名（证明"这笔交易是我同意的"）
 *   3. 把签好名的交易发给节点
 *
 * 这个文件用一百来行把这三件事重新实现了一遍。看懂它，你就看懂了钱包。
 *
 * 【为什么它能"冒充" MetaMask】
 *
 * 网页和钱包插件之间有一个约定俗成的接口，叫 EIP-1193：
 * 钱包只要在页面上放一个 window.ethereum 对象，实现 request() 方法，
 * 网页就能跟它对话。MetaMask 是这么做的，我们这个文件也是这么做的 ——
 * 所以 app.js 一行都不用改，它根本不知道自己面对的是谁。
 *
 * 这就是"接口大于实现"：任何人只要实现了同一个接口，就能替换掉 MetaMask。
 *
 * ─────────────────────────────────────────────────────────────
 * 【⚠️ 安全警告 —— 这段请务必读完，它是本文件最重要的部分】
 *
 * 这个工具把私钥放在浏览器里，是**故意**为了教学才这么干的。
 *
 * 真实世界的铁律是：网页永远不应该接触你的私钥。
 * 钱包之所以存在，就是为了把"签名"这个动作关在你自己的设备里，
 * 让网页只能拿到"已签名的交易"，拿不到钥匙本身。
 *
 * 所以：
 *   ✅ 只能用在本地区块链（那些私钥全世界都知道，里面只有假币）
 *   ❌ 绝对不要填你的真实私钥 —— 哪怕只是"试一下"
 *
 * 顺便注意一个设计：这里用 sessionStorage 而不是 localStorage。
 * 关掉标签页，私钥就忘了。这是故意的 —— 少存一秒是一秒。
 */
(function () {
  "use strict";

  // 本地区块链的地址。不想用默认的，改这里。
  const RPC_URL = "http://127.0.0.1:8545";

  // sessionStorage 的 key。关掉标签页就没了，见上面说明。
  const STORAGE_KEY = "cryptostarter.devkey";

  /**
   * Hardhat 公开的测试账户。
   * 这些私钥来自助记词 "test test test test test test test test test test test junk"，
   * 全世界都知道，**里面只有假币**。
   */
  const TEST_ACCOUNTS = [
    {
      label: "Account #0 · 部署者（有 100 万 LEARN）",
      address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      key: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    },
    {
      label: "Account #1 · alice（0 枚，可以领水龙头）",
      address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      key: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
    },
    {
      label: "Account #2 · bob（0 枚，可以领水龙头）",
      address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
      key: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
    },
  ];

  // ---------- JSON-RPC 转发 ----------
  //
  // 凡是"读"的操作（查余额、查区块），我们不做任何处理，
  // 原样转发给节点就行。只有"写"的操作才需要签名，见下面 eth_sendTransaction。

  let rpcId = 1;
  const listeners = {};

  async function forward(method, params) {
    const res = await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: rpcId++,
        method,
        params: params || [],
      }),
    });
    const json = await res.json();
    if (json.error) {
      const err = new Error(json.error.message);
      err.code = json.error.code;
      err.data = json.error.data;
      throw err;
    }
    return json.result;
  }

  // ---------- 钱包本体 ----------

  let wallet = null; // ethers.Wallet，同时持有私钥和"能发交易"的能力

  /** 造出那个网页期待已久的 window.ethereum 对象。 */
  function buildEthereum() {
    return {
      isMetaMask: false,
      isCryptoStarterDevWallet: true,

      async request({ method, params }) {
        switch (method) {
          // "我是谁" —— 直接告诉他地址，不用弹窗
          case "eth_requestAccounts":
          case "eth_accounts":
            return [wallet.address];

          // "换个网络" —— 我们本来就连着目标链，无事可做
          case "wallet_switchEthereumChain":
          case "wallet_addEthereumChain":
            return null;

          // 【核心】发交易 —— 唯一需要签名的地方
          case "eth_sendTransaction": {
            const tx = params[0];
            // wallet.sendTransaction 内部会：补齐 nonce / gas / chainId
            // → 用私钥签名 → 通过 RPC 广播出去
            // 这正是 MetaMask 弹窗点"确认"之后干的事
            const sent = await wallet.sendTransaction({
              to: tx.to,
              data: tx.data,
              value: tx.value ? BigInt(tx.value) : undefined,
              gasLimit: tx.gas ? BigInt(tx.gas) : undefined,
            });
            return sent.hash;
          }

          // 其他一切都交给节点
          default:
            return forward(method, params);
        }
      },

      // EIP-1193 规定的事件订阅。真 MetaMask 会在换账户/换网络时触发这些，
      // 我们这里不会变，所以只是留个空壳让 interface 完整。
      on(event, cb) {
        (listeners[event] = listeners[event] || []).push(cb);
      },
      removeListener(event, cb) {
        listeners[event] = (listeners[event] || []).filter((f) => f !== cb);
      },
    };
  }

  /** 用私钥"打开"钱包，并把 window.ethereum 装上。 */
  function install(privateKey) {
    // JsonRpcProvider 负责"和节点说话"，Wallet 负责"签名"，两者拼起来就是完整钱包
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    wallet = new ethers.Wallet(privateKey, provider);
    window.ethereum = buildEthereum();
  }

  // ---------- 启动 ----------
  //
  // 脚本在页面末尾、app.js 之前执行，所以这里装好的 window.ethereum
  // 会被 app.js 当成真的 MetaMask 用。

  const savedKey = sessionStorage.getItem(STORAGE_KEY);
  let active = false;

  if (savedKey) {
    try {
      install(savedKey);
      active = true;
    } catch (err) {
      sessionStorage.removeItem(STORAGE_KEY);
      console.warn("内置钱包启动失败，已清除保存的私钥：", err.message);
    }
  }

  // ---------- 界面 ----------

  window.addEventListener("DOMContentLoaded", () => {
    const card = document.getElementById("dev-wallet-card");
    const select = document.getElementById("dev-account");
    const status = document.getElementById("dev-status");
    if (!card) return;

    // 下拉框里列出测试账户
    TEST_ACCOUNTS.forEach((acc, i) => {
      const opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = acc.label;
      select.appendChild(opt);
    });

    /** 存私钥 → 重新加载页面，让 app.js 重新启动一遍。 */
    function useKey(key) {
      try {
        // 先验一下这串东西是不是合法私钥，别等页面重载了才发现填错
        const probe = new ethers.Wallet(key);
        sessionStorage.setItem(STORAGE_KEY, key);
        console.log("内置钱包已启用：", probe.address);
        location.reload();
      } catch {
        alert("这不是一个合法的私钥。\n\n应该是 0x 开头的 64 位十六进制字符串。");
      }
    }

    document.getElementById("btn-dev-connect").onclick = () => {
      useKey(TEST_ACCOUNTS[Number(select.value)].key);
    };

    document.getElementById("btn-dev-key").onclick = () => {
      const key = document.getElementById("dev-key").value.trim();
      if (!key) return alert("先粘贴一个私钥，或者直接用上面的测试账户");
      useKey(key);
    };

    // 当前状态：正在用内置钱包就把地址显示出来，并给个"退出"按钮
    if (active) {
      // 页面重载后下拉框会重置，把它选回当前正在用的那个账户
      const current = TEST_ACCOUNTS.findIndex(
        (a) => a.address.toLowerCase() === wallet.address.toLowerCase()
      );
      if (current >= 0) select.value = String(current);

      status.textContent = `✅ 正在使用内置钱包：${wallet.address}`;
      const out = document.createElement("button");
      out.className = "ghost small";
      out.textContent = "退出内置钱包";
      out.onclick = () => {
        sessionStorage.removeItem(STORAGE_KEY);
        location.reload();
      };
      status.after(out);

      // app.js 的按钮上写的是"连接 MetaMask"，现在名不副实了，改一下
      const btn = document.getElementById("btn-connect");
      if (btn) btn.textContent = "连接内置钱包";
    } else if (window.ethereum) {
      // 页面上已经有 MetaMask，但用户随时可以改用内置钱包绕过它
      status.textContent = "检测到 MetaMask 正在工作。想跳过它？选个测试账户点上面。";
    } else {
      status.textContent = "没有检测到 MetaMask，直接用上面的内置钱包即可。";
    }
  });
})();
