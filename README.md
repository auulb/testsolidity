# CryptoStarter · 你的第一个 Web3 项目

一个**可以直接运行**的加密行业入门项目。跑完之后你就亲手做过：
发行代币 → 领币 → 授权 → 付费调用合约 → 读链上数据 → 提取协议收入。

这六个动作，就是加密行业 90% 的产品在干的事。Uniswap 是它们，NFT 市场是它们，
链游、DeFi 借贷、稳定币……本质都是这六个动作的不同排列组合。

---

## 目录

1. [这个项目做了什么](#一这个项目做了什么)
2. [开工前：加密行业概念速查](#二开工前加密行业概念速查)
3. [环境准备](#三环境准备)
4. [跑起来：5 分钟](#四跑起来5-分钟)
5. [用网页 dApp 玩一遍](#五用网页-dapp-玩一遍)
6. [代码讲解](#六代码讲解)
7. [常见问题](#七常见问题)
8. [下一步学什么](#八下一步学什么)

---

## 一、这个项目做了什么

两个智能合约 + 一个网页：

| 组件 | 是什么 | 你学到什么 |
|---|---|---|
| `LearningToken.sol` | 一个 ERC-20 代币 `LEARN`，带"水龙头"免费领币 | 代币标准、mint、mapping、事件 |
| `Guestbook.sol` | 链上留言板，留言要花 1 个 LEARN | approve 授权、合约间调用、付费模式 |
| `frontend/` | 网页 dApp，用 MetaMask 连接 | 钱包、签名、交易生命周期、事件监听 |
| `test/` | 12 个测试 | 合约测试怎么写、怎么测 revert |
| `scripts/` | 部署脚本 + 命令行演示 | 部署流程、gas 到底花在哪 |

---

## 二、开工前：加密行业概念速查

**这是全文最该先读的部分。** 不理解这些词，代码看得懂也白搭。

### 区块链 / 链

一个**所有人共同维护、没人能篡改**的账本。你写进去的数据，全网几万个节点都存一份，
想改得同时改掉一半以上的节点，成本高到不可能 —— 这就是"不可篡改"。

- **以太坊 (Ethereum)**：最主流的"可编程区块链"，能跑智能合约
- **测试网 / 主网**：测试网是练习场，币是假的；主网是真钱
- **本地链**：这个项目跑在你自己电脑上的链，最快、最安全、随便折腾

### 账户 / 私钥 / 地址

```
私钥 (Private Key)  →  一串随机数，你的全部身家。泄露 = 资产归零。
    ↓ 推导（单向，推不回去）
公钥 (Public Key)
    ↓ 再哈希
地址 (Address)      →  0x开头的 42 位字符串，可以随便公开，像银行账号
```

> ⚠️ **行业第一铁律**：私钥永远不给任何人，不输入任何网站，不发到聊天软件里。
> 任何人问你要私钥或助记词，100% 是骗子，没有例外。

### 钱包 / MetaMask

钱包不是"装钱的袋子"，它是**替你保管私钥、并对交易签名的工具**。
币一直在链上，钱包只是那把钥匙。MetaMask 是浏览器插件钱包，开发者人手一个。

### Gas

链上每一次"写"操作都要付费，这叫 gas。费用给**矿工/验证者**，奖励他们帮你记账。
- **读**数据（查余额）→ 免费
- **写**数据（转账、留言）→ 收费
- **交易失败回滚，gas 不退** → 新手最常亏钱的地方

### 智能合约

部署在链上的程序，一旦部署**不可修改**。所以行业里说 "Code is Law"，
上线前必须测试、审计 —— 因为写错的代价是真金白银，而且撤不回来。

### ERC-20

代币的标准接口，规定了 `transfer` / `balanceOf` / `approve` 这些方法名。
只要你的合约实现它，MetaMask、Uniswap、交易所全都能直接认，零改造。
USDT、UNI、SHIB 全是 ERC-20。

### approve 授权机制（本项目重点）

合约**无权直接动你钱包里的币**。流程必须是：

```
1. 你调用 token.approve(某个合约, 100)   ← 授权它最多花你 100 个
2. 那个合约调用 token.transferFrom(你, 它, 100)  ← 从你的额度里划走
```

这是安全设计：合约有 bug 也最多只能拿走你授权的额度。**忘了第 1 步就会报错**，
这是新手最常踩的坑，本项目专门有测试演示它。

---

## 三、环境准备

需要 **Node.js 18+**。

### ⚠️ 先检查你的 Node 是不是"正规的"

在终端运行：

```bash
node -v
ls -la $(which node)
```

**如果输出的路径里包含 `ChatGPT.app`、`Cursor.app`、`Electron` 等字样**，
说明你用的是别的软件捎带的 Node，它加载不了原生模块，跑本项目会报这个错：

```
Error: dlopen(...solidity-analyzer.darwin-arm64.node...)
code signature ... not valid for use in process
```

**解决办法**：装一个官方 Node。

```bash
# 下载官方预编译包（约 50MB，秒装，不需要编译）
curl -L -o /tmp/node.tar.gz https://nodejs.org/dist/v24.21.0/node-v24.21.0-darwin-arm64.tar.gz

# 解压到你自己的工具目录
rm -rf ~/.local/node
tar -xzf /tmp/node.tar.gz -C /tmp
mv /tmp/node-v24.21.0-darwin-arm64 ~/.local/node

# 让 shell 用新 Node
ln -sfn ~/.local/node/bin/node ~/.local/bin/node
ln -sfn ~/.local/node/lib/node_modules/npm/bin/npm-cli.js ~/.local/bin/npm
ln -sfn ~/.local/node/lib/node_modules/npm/bin/npx-cli.js ~/.local/bin/npx

# 验证
node -v && npm -v && ls -la $(which node)
```

看到 `node -> /Users/你的用户名/.local/node/bin/node` 就对了。

> ⚠️ **不要用 `brew install node`**。在较新的 macOS 上 Homebrew 常常没有现成
> 预编译包，会转而从源码编译 LLVM —— 那是几个 GB 的下载加几小时的编译，
> 完全不值得。官方 tar.gz 是预编译好的，解压即用。
>
> 官方 Node 的签名里带着 `com.apple.security.cs.disable-library-validation` 权限，
> 这正是它能加载 Hardhat 原生模块、而别家软件捎带的 Node 加载不了的原因。

---

## 四、跑起来：5 分钟

### 第 0 步：安装依赖

```bash
cd "你的项目目录"
npm install
```

### 第 1 步：跑测试（不花钱、不出网、最安全）

```bash
npm test
```

应该看到 `12 passing`。这一步验证合约逻辑没问题。

### 第 2 步：启动本地区块链

```bash
npm run node
```

**这个终端不要关**，它就是你的"私人以太坊"。启动后会打印 20 个测试账户
和它们的私钥 —— 抄下来，下一步要用。

你会看到类似：

```
Account #0: 0xf39Fd6...B92266 (10000 ETH)
Private Key: 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
Account #1: 0x709979...79C8 (10000 ETH)
Private Key: 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
```

> 这些私钥是 Hardhat 公开的测试助记词，全世界都知道，**里面只有假币**。
> 千万别往这些地址转真钱。

### 第 3 步：部署合约（新开一个终端）

```bash
npm run deploy
```

输出里会看到代币和留言板的地址。同时自动生成了前端需要的 `frontend/contracts.js`。

### 第 4 步：命令行体验完整业务流

```bash
npm run demo
```

这一步会**不打开浏览器**把整个流程走一遍，并且把每笔交易的 gas 消耗、
触发的事件都打印出来。**建议你认真读一遍输出** —— 前端会把这些细节藏起来，
但作为开发者你必须见过它们。

### 第 5 步：打开网页

```bash
npm run frontend
```

浏览器访问 **http://localhost:3000**

---

## 五、用网页 dApp 玩一遍

### 5.0 不想用 / 用不了 MetaMask？用内置钱包

页面上有一张「**🛠 内置开发钱包**」卡片，选个测试账户点一下就能用，**完全不需要装 MetaMask**。
选 Account #1 或 #2（余额 0），能完整走一遍「领币 → 授权 → 留言」。

它是什么？MetaMask 的本质只有三件事：**保管私钥 → 签名 → 广播**。
`frontend/localwallet.js` 用一百来行把这三件事重新实现了一遍。

**关键在这**：它遵循和 MetaMask 完全相同的接口标准（EIP-1193）——
就是在 `window` 上放一个 `ethereum` 对象，实现 `request()` 方法。
所以 `app.js` 一行都不用改，它根本不知道自己在跟谁说话。

> 这就是行业里说的「接口大于实现」：只要实现了同一个接口，任何人都能替换掉 MetaMask。
> **看懂 `localwallet.js` 是理解「钱包到底是什么」最直接的方式。**

> ⚠️ **它只能用于本地测试链。** 那些私钥全世界都知道、里面只有假币。
> 绝对不要填入你的真实私钥 —— 网页本就不该接触私钥，这正是我们需要 MetaMask 的原因。
> 代码里故意用 `sessionStorage` 存它：关掉标签页就忘掉，少存一秒是一秒。

---

### 5.1 给 MetaMask 添加本地网络

MetaMask → 左上角网络选择 → 添加网络 → 手动添加：

| 字段 | 值 |
|---|---|
| 网络名称 | Localhost 31337 |
| RPC URL | `http://127.0.0.1:8545` |
| Chain ID | `31337` |
| 货币符号 | ETH |

### 5.2 导入一个有币的测试账户

本地链上的账户 MetaMask 默认不认识，需要手动导入私钥：

1. MetaMask → 点账户头像 → **导入账户**
2. 粘贴 `npm run node` 终端里打印的 **Account #0 的 Private Key**
3. 导入后你会看到这个账户有 10000 ETH

> 💡 为什么用 Account #0？因为部署合约的就是它，它手里有 100 万枚初始 LEARN。
> 不过本项目用不到，你后面领币用的是水龙头。

### 5.3 开玩

1. 点 **连接 MetaMask** → 弹窗确认
2. 点 **领取 10 LEARN** → 弹窗确认 → 等几秒上链
3. 写句留言 → 点 **花 1 LEARN 留言** → **会弹两次** MetaMask：
   - 第一次是 `approve`（授权合约花你 1 枚币）
   - 第二次是 `post`（真正留言）
4. 页面下方能看到**交易日志**，每笔的哈希、gas 都记着
5. 再点一次领取 → 会提示"冷却中，还需等待 23 小时 xx 分"

### 5.4 观察"不可篡改"

打开一个新的浏览器隐身窗口，再导入 **Account #1** 的私钥，连上同一个网站。
你会看到 Account #0 留的言 —— **因为数据在链上，不在某个服务器里。**

想清空重来？关掉 `npm run node`，重启，重新 `npm run deploy` 即可。

---

## 六、代码讲解

### 6.1 `contracts/LearningToken.sol` —— 代币

```solidity
contract LearningToken is ERC20 {
    // 继承 OpenZeppelin 的 ERC20，transfer/balanceOf/approve 全都白送了
    uint256 public constant FAUCET_AMOUNT = 10 ether;   // 每次领 10 枚
    uint256 public constant FAUCET_COOLDOWN = 1 days;   // 24 小时冷却
    mapping(address => uint256) public lastClaimAt;     // 谁什么时候领过

    function faucet() external {
        require(lastClaimAt[msg.sender] == 0 ||
                block.timestamp >= lastClaimAt[msg.sender] + FAUCET_COOLDOWN,
                "LearningToken: faucet on cooldown, come back in 24h");
        lastClaimAt[msg.sender] = block.timestamp;
        _mint(msg.sender, FAUCET_AMOUNT);   // 凭空造币，这叫 mint
        emit FaucetClaimed(msg.sender, FAUCET_AMOUNT);
    }
}
```

三个关键点：

- **`is ERC20`（继承）** —— 标准方法不用自己写。OpenZeppelin 是行业标准库，
  生产项目几乎都用它，自己从零写 ERC-20 是新手常见的错误做法。
- **`msg.sender`** —— 以太坊最重要的变量：**谁在调用这个函数**。
  它由私钥签名推导，任何合约都无法伪造。整个 Web3 的"身份"就靠它。
- **`emit FaucetClaimed`** —— 事件是廉价的日志，前端和区块浏览器靠它做实时提醒。
  存数据要花大钱（每个存储槽 20000 gas），写事件便宜得多（约 375 gas）。

### 6.2 `contracts/Guestbook.sol` —— 付费留言板

```solidity
function post(string calldata content) external {
    require(bytes(content).length > 0, "Guestbook: empty message");

    // 核心：从留言者手里划走 1 枚 LEARN
    bool ok = paymentToken.transferFrom(msg.sender, address(this), POST_PRICE);
    require(ok, "Guestbook: payment failed, did you approve first?");

    _messages.push(Message({author: msg.sender, content: content,
                            timestamp: block.timestamp}));
    emit NewMessage(msg.sender, content, _messages.length - 1);
}
```

这一行 `transferFrom` 是整个项目的核心。它背后的机制：

```
你 → token.approve(Guestbook, 1 LEARN)  → 链上记录：Guestbook 最多可花你 1 枚
你 → Guestbook.post("你好")              → Guestbook 调 transferFrom 把钱划走
```

**没做第一步会怎样？** 会 revert。有意思的是报的错不是我们写的提示语，
而是 `ERC20InsufficientAllowance` 这个自定义错误 —— 因为 OpenZeppelin v5
在额度不足时直接抛错，压根走不到我们的 `require`。`test/` 里专门有一个测试
断言这个行为。**这类"标准实现之间的细微差异"就是审计师找漏洞的地方。**

### 6.3 一个刻意的"教学版写法"

`getAllMessages()` 一次性返回所有留言，写着方便，但**真实项目绝不能这么干**：
留言上万条时这个调用会直接超出 gas 上限，整个函数不可用。

生产做法是：**事件 + 链下索引**。合约只发 `NewMessage` 事件，
链下用 The Graph 或自己跑个 indexer 把事件存进数据库，前端查数据库。

面试时主动说出这个区别，是很加分的。

### 6.4 `frontend/app.js` —— 前端

前端只做三件事，和传统 Web 开发最大的区别在这里：

| 操作 | 花费 | 要签名吗 | 代码 |
|---|---|---|---|
| 读数据 | 免费 | 不用 | `await token.balanceOf(addr)` |
| 写数据 | 花 gas | 要 | `await tx.wait()` |
| 监听事件 | 免费 | 不用 | `guestbook.on("NewMessage", ...)` |

特别看这段：

```js
const tx = await token.faucet();              // 1. 用户签名，交易广播出去
log(`交易已广播：${tx.hash}，等待打包…`);      //    ← 此刻还没上链！
const receipt = await tx.wait();               // 2. 等矿工打包，通常几秒
log(`✅ 上链成功！区块 #${receipt.blockNumber}`);
```

**"已广播"和"已上链"是两回事**，中间隔着几秒到几十秒。
新手常犯的错就是拿到 `tx.hash` 就以为成功了，没等 `tx.wait()` 就去读状态，
结果读到的是旧值。这是前端 dApp 最经典的 bug。

---

## 七、常见问题

**Q: 网页连不上、余额一直是 0、或者报一堆看不懂的错**
→ **先跑 `npm run check`。** 它会从下往上排查：链活着吗 → 合约真的部署了吗。
全绿就说明问题在钱包或前端，不在链这边 —— 这一步能帮你省掉几个小时的瞎猜。

**Q: `npm run node` 报 `dlopen ... code signature` 错误**
→ 你的 Node 是别的软件捎带的。见 [三、环境准备](#三环境准备)。

**Q: 网页打开是 404，提示找不到 contracts.js**
→ 没跑 `npm run deploy`，或者跑完部署后重启了本地链（地址变了）。重新 `npm run deploy`。

**Q: MetaMask 连不上 / 余额一直是 0**
→ 检查三点：① `npm run node` 还开着吗 ② 网络是不是 Localhost 31337
③ 有没有导入有币的账户私钥。

**Q: 留言时只弹了一次 MetaMask**
→ 正常。如果你之前已经授权过 1 枚且没用完，会跳过 approve 直接 post。
授权额度用完后再留言就又会弹两次。

**Q: 交易一直 pending**
→ 本地链的区块是"你发交易才出块"。确认 `npm run node` 那个终端还活着。

**Q: 我想重新开始**
→ Ctrl+C 停掉 `npm run node`，重新启动，再 `npm run deploy`。链上的旧数据全没了。

**Q: `nonce too high` 或交易一直失败**
→ 重启本地链后，MetaMask 里缓存的 nonce 没跟上。
MetaMask → 设置 → 高级 → **清除活动标签数据**，然后重新连接。

**Q: `npm run frontend` 报端口 3000 被占用**
→ 你机器上已经有别的开发服务器在跑（比如 Next.js）。换个端口：

```bash
PORT=3001 npm run frontend
```

然后浏览器访问 http://localhost:3001 即可。

---

## 八、下一步学什么

按这个顺序走，每一步都建议**动手写代码**，光看没用：

**第 1 阶段 · 打牢 Solidity（1-2 周）**
- 把本项目的 `LearningToken` 改造：加转账手续费、加销毁、加总量上限
- 学 `struct` / `mapping` / `modifier` / `interface` / `library`
- 推荐：[Solidity 官方文档](https://docs.soliditylang.org/)、[CryptoZombies](https://cryptozombies.io/zh/)

**第 2 阶段 · 吃透行业标准（1-2 周）**
- **ERC-721（NFT）**：写一个自己的 NFT 合约，用 IPFS 存图片
- **ERC-1155**：一份合约多种资产，游戏道具常用
- 去 [OpenZeppelin Contracts](https://docs.openzeppelin.com/contracts) 读源码

**第 3 阶段 · 安全（这是行业最值钱的技能）**
- 过一遍 [Ethernaut](https://ethernaut.openzeppelin.com/) 全部关卡
- 读 [SWC Registry](https://swcregistry.io/) 常见漏洞：重入、整数溢出、权限缺失、预言机操纵
- **拿本项目的 `withdrawFees` 当练习题**：它遵循了"检查 → 生效 → 交互"（CEI）里的
  前两步，但**先转账、之后没有任何状态更新**。请你自己回答三个问题：
  ① 如果 `paymentToken` 是 ERC-777 那种带回调的"钩子代币"，会发生什么？
  ② 重入进来的话，第二次 `balanceOf(address(this))` 读到的是多少？为什么？
  ③ 换成"先记账、最后统一转账"的写法会不会更安全？为什么？
  想清楚这三个问题，你就摸到重入攻击的门了。

**第 4 阶段 · 前端与工具链**
- 把项目换成 **TypeScript + wagmi + viem**（现在的主流技术栈）
- 学 **Foundry**（比 Hardhat 更快，Solidity 写测试）
- 用 **The Graph** 做链下索引

**第 5 阶段 · 进入真实网络**
- 去 [Alchemy](https://www.alchemy.com/) 或 Infura 注册免费 RPC，部署到 **Sepolia 测试网**
- 在 [Etherscan](https://sepolia.etherscan.io/) 上验证合约源码
- 参加 **Code4rena / Sherlock** 的审计竞赛，这是新手积累履历最好的方式

**必读资源**
- [以太坊官方文档](https://ethereum.org/zh/developers/docs/)
- [Hardhat 文档](https://hardhat.org/docs)
- [OpenZeppelin 论坛](https://forum.openzeppelin.com/)

---

## 项目结构

```
.
├── contracts/
│   ├── LearningToken.sol      # ERC-20 代币 + 水龙头
│   └── Guestbook.sol          # 付费留言板
├── test/
│   └── CryptoStarter.test.js  # 12 个测试
├── scripts/
│   ├── deploy.js              # 部署，并生成前端需要的地址/ABI
│   ├── interact.js            # 命令行走完整业务流程
│   ├── check-chain.js         # 链健康检查（排查问题第一步）
│   └── serve.js               # 本地静态服务器
├── frontend/
│   ├── index.html
│   ├── style.css
│   ├── app.js                 # 连接钱包、发交易、监听事件
│   ├── localwallet.js         # 内置开发钱包（不用 MetaMask 的替代品）
│   ├── contracts.js           # ← 部署时自动生成，勿手改
│   └── deployment.json        # ← 部署时自动生成，勿手改
└── hardhat.config.js
```

---

## 常用命令

| 命令 | 作用 |
|---|---|
| `npm test` | 跑测试 |
| `npm run node` | 启动本地链（保持开着） |
| `npm run deploy` | 部署合约到本地链 |
| `npm run demo` | 命令行走完整业务流程 |
| `npm run check` | 检查链和合约是否正常（**排查问题的第一步**） |
| `npm run frontend` | 启动网页 dApp |
| `npm run compile` | 只编译合约 |

---

**祝你在加密行业玩得开心。记住第一铁律：私钥不给任何人。**
