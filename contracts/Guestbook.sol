// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title Guestbook
 * @notice 链上留言板：留言要花 1 个 LEARN。
 *
 * 这个合约只有 100 行，却是加密行业最经典的三个模式合体：
 *
 * 1) 「付费调用」——想用我的服务，先付币。
 *    这就是所有 Web3 商业模式的雏形：NFT 铸造费、DEX 交易手续费、链游入场费。
 *
 * 2) 「approve + transferFrom」——代币的授权机制。
 *    合约不能直接掏你钱包里的币，必须你先 approve 授权额度，它才能拿。
 *    这是 ERC-20 最容易踩坑、面试最爱问的地方。
 *
 * 3) 「事件 + 链上存储」——状态永久存在链上，谁都能读，谁都改不了。
 */
contract Guestbook {
    /// @notice 我们用哪种代币收费。部署时传进来，合约可复用。
    IERC20 public immutable paymentToken;

    /// @notice 部署者地址，也就是项目方，有权提取手续费。
    ///         immutable 跟 constant 的区别：constant 编译期就定死，
    ///         immutable 是部署那一刻写入字节码，之后不可改。
    address public immutable owner;

    /// @notice 发一条留言的价格：1 个 LEARN。
    uint256 public constant POST_PRICE = 1 ether;

    /// @notice 一条留言的数据结构。struct 是 Solidity 的自定义类型。
    struct Message {
        address author; // 谁留的（钱包地址）
        string content; // 留言内容
        uint256 timestamp; // 什么时间（区块时间戳）
    }

    /// @notice 所有留言，按顺序存成一个数组。
    Message[] private _messages;

    /// @notice 每个地址留言了几次。用 mapping 做统计，比遍历数组省 gas。
    mapping(address => uint256) public postCount;

    /// @notice 有人留言时触发。indexed 表示这个字段可以被前端按值过滤搜索。
    event NewMessage(address indexed author, string content, uint256 index);

    constructor(address tokenAddress) {
        require(tokenAddress != address(0), "Guestbook: token address is zero");
        paymentToken = IERC20(tokenAddress);
        owner = msg.sender;
    }

    /**
     * @notice 花 1 个 LEARN 留一条言。
     * @param content 留言内容
     *
     * @dev 调用前你必须先执行 approve(guestbookAddress, 1e18)。
     *      没授权就直接调用，会在这里报错回滚（revert），
     *      注意：整笔交易会撤销，但已经花掉的 gas 不退 —— 这是新手最常亏钱的地方。
     */
    function post(string calldata content) external {
        require(bytes(content).length > 0, "Guestbook: empty message");
        require(bytes(content).length <= 200, "Guestbook: message too long");

        // 从 msg.sender 的余额里，把 1 个 LEARN 划到本合约。
        // 没 approve 过、或者余额不够，这一步就会回滚。
        //
        // 两个细节很值得注意：
        //  a) 标准 ERC-20 的 transferFrom 返回 bool，所以下面这行 require 是必须的保险。
        //  b) 但我们用的是 OpenZeppelin v5，它在授权不足时直接 revert(ERC20InsufficientAllowance)，
        //     压根不会返回 false。这就是为什么测试里断言的是「自定义错误」而不是这行提示语。
        //     换成 USDT 这种老式代币，行为又不一样 —— 所以接入任何 ERC-20 前都要先看它的实现。
        bool ok = paymentToken.transferFrom(msg.sender, address(this), POST_PRICE);
        require(ok, "Guestbook: payment failed, did you approve first?");

        _messages.push(
            Message({author: msg.sender, content: content, timestamp: block.timestamp})
        );
        postCount[msg.sender] += 1;

        emit NewMessage(msg.sender, content, _messages.length - 1);
    }

    /// @notice 留言总数。
    function totalMessages() external view returns (uint256) {
        return _messages.length;
    }

    /// @notice 按序号读一条留言。链上数据是公开的，任何人都能查。
    function getMessage(uint256 index) external view returns (Message memory) {
        require(index < _messages.length, "Guestbook: index out of range");
        return _messages[index];
    }

    /**
     * @notice 一次把全部留言拉回来，方便前端展示。
     * @dev 真实项目不会这么写 —— 留言上万条时，这个调用会直接超出 gas 上限。
     *      生产做法是用事件 + 链下索引（The Graph / 自己跑个 indexer）。
     *      这里为了教学简单才这么做，面试时可以主动说出这个区别。
     */
    function getAllMessages() external view returns (Message[] memory) {
        return _messages;
    }

    /// @notice 合约里攒的 LEARN 可以提走，归部署者（项目方）所有。
    ///         这就是"协议收入"最朴素的形态。
    function withdrawFees(address to) external {
        require(msg.sender == owner, "Guestbook: not owner");

        uint256 balance = paymentToken.balanceOf(address(this));
        require(balance > 0, "Guestbook: nothing to withdraw");
        require(paymentToken.transfer(to, balance), "Guestbook: withdraw failed");
    }
}
