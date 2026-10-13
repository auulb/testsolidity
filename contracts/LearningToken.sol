// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title LearningToken (LEARN)
 * @notice 你的第一个 ERC-20 代币。
 *
 * 为什么从 ERC-20 开始？
 *   稳定币(USDT/USDC)、治理币(UNI)、积分、平台币……链上 90% 的"币"都是 ERC-20。
 *   它就是一个标准接口，规定了「转账 transfer」「查余额 balanceOf」「授权 approve」这些方法，
 *   所有钱包、交易所、DeFi 协议都按这个标准对接。你写的代币只要符合标准，
 *   MetaMask 不用改一行代码就能显示它。
 *
 * 这个代币比"标准款"多了一个 faucet()：水龙头。
 *   真实世界的测试网代币都有水龙头，让开发者免费领币去测试。我们照抄这个模式，
 *   这样你在本地也能"凭空"拿到币，去玩下一个合约。
 */
contract LearningToken is ERC20 {
    /// @notice 每次领多少币。18 位小数，所以是 10 * 10^18 最小单位。
    uint256 public constant FAUCET_AMOUNT = 10 ether;

    /// @notice 两次领取之间必须间隔的时间（24 小时），防止有人把水龙头薅干。
    uint256 public constant FAUCET_COOLDOWN = 1 days;

    /// @notice 记录每个地址上次领币的时间戳。mapping 是 Solidity 的哈希表。
    mapping(address => uint256) public lastClaimAt;

    /// @notice 领币时抛出的链上事件。事件 = 便宜的日志，前端和区块浏览器靠它做实时提醒。
    event FaucetClaimed(address indexed user, uint256 amount);

    /**
     * @param initialSupply 初始发行量，全部发给部署者（也就是你）。
     *                      "部署者"在加密行业里叫 deployer，是第一个持有者。
     */
    constructor(uint256 initialSupply) ERC20("Learning Token", "LEARN") {
        _mint(msg.sender, initialSupply);
    }

    /**
     * @notice 领取 10 个 LEARN。每 24 小时一次。
     * @dev 注意 `msg.sender` —— 这是以太坊最重要的变量：
     *      它是"调用这个函数的人"，由私钥签名决定，任何合约都无法伪造。
     *      整个 Web3 的"身份"概念就建立在它上面。
     */
    function faucet() external {
        uint256 last = lastClaimAt[msg.sender];
        require(
            last == 0 || block.timestamp >= last + FAUCET_COOLDOWN,
            "LearningToken: faucet on cooldown, come back in 24h"
        );

        lastClaimAt[msg.sender] = block.timestamp;
        _mint(msg.sender, FAUCET_AMOUNT);

        emit FaucetClaimed(msg.sender, FAUCET_AMOUNT);
    }

    /// @notice 距离下次可领币还剩多少秒。前端可以拿它做倒计时。
    function secondsUntilNextClaim(address user) external view returns (uint256) {
        uint256 last = lastClaimAt[user];
        if (last == 0) return 0;

        uint256 readyAt = last + FAUCET_COOLDOWN;
        if (block.timestamp >= readyAt) return 0;

        return readyAt - block.timestamp;
    }
}
