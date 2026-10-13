const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");

/**
 * 智能合约的测试跟普通后端测试有一个关键区别：
 * 你测的是"钱"。一行写错就是真金白银的损失，所以行业里测试覆盖率普遍要求 90%+。
 *
 * 行业习惯（务必养成）：
 *   1. 用 loadFixture 复用链上状态 —— 每跑一个测试就重置一次链，测试之间互不干扰，而且快。
 *   2. 正常路径 + 异常路径都要测。revert 的测试用 revertedWith。
 *   3. 测"权限"：不是 owner 的人能不能干 owner 的事？答案必须是不能。
 */
describe("CryptoStarter —— 代币 + 留言板", function () {
  const INITIAL_SUPPLY = ethers.parseEther("1000000"); // 100 万枚
  const ONE_LEARN = ethers.parseEther("1");

  /**
   * 把"部署"这段准备工作封装起来，loadFixture 会快照第一次的结果，
   * 后面每个测试直接回滚到这个快照，不用重新部署。
   */
  async function deployFixture() {
    const [deployer, alice, bob] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("LearningToken");
    const token = await Token.deploy(INITIAL_SUPPLY);
    await token.waitForDeployment();

    const Guestbook = await ethers.getContractFactory("Guestbook");
    const guestbook = await Guestbook.deploy(await token.getAddress());
    await guestbook.waitForDeployment();

    return { token, guestbook, deployer, alice, bob };
  }

  describe("1. LearningToken —— 你的第一个 ERC-20", function () {
    it("部署时把 100 万枚全部发给部署者", async function () {
      const { token, deployer } = await loadFixture(deployFixture);

      expect(await token.name()).to.equal("Learning Token");
      expect(await token.symbol()).to.equal("LEARN");
      expect(await token.decimals()).to.equal(18);
      expect(await token.totalSupply()).to.equal(INITIAL_SUPPLY);
      expect(await token.balanceOf(deployer.address)).to.equal(INITIAL_SUPPLY);
    });

    it("用户可以互相转账", async function () {
      const { token, deployer, alice } = await loadFixture(deployFixture);
      const amount = ethers.parseEther("100");

      await expect(token.transfer(alice.address, amount))
        .to.emit(token, "Transfer")
        .withArgs(deployer.address, alice.address, amount);

      expect(await token.balanceOf(alice.address)).to.equal(amount);
    });

    it("余额不够时转账会回滚", async function () {
      const { token, alice, bob } = await loadFixture(deployFixture);
      // alice 一分钱都没有，转 1 枚必须失败
      await expect(
        token.connect(alice).transfer(bob.address, ONE_LEARN)
      ).to.be.revertedWithCustomError(token, "ERC20InsufficientBalance");
    });

    it("水龙头：第一次领 10 枚，立刻再领会被 24 小时冷却拦住", async function () {
      const { token, alice } = await loadFixture(deployFixture);

      await expect(token.connect(alice).faucet())
        .to.emit(token, "FaucetClaimed")
        .withArgs(alice.address, ethers.parseEther("10"));

      expect(await token.balanceOf(alice.address)).to.equal(ethers.parseEther("10"));

      // 冷却中
      await expect(token.connect(alice).faucet()).to.be.revertedWith(
        "LearningToken: faucet on cooldown, come back in 24h"
      );

      // 时间快进 24 小时 —— time 工具直接操纵本地区块时间，测试时间相关逻辑的利器
      await time.increase(24 * 60 * 60);

      await expect(token.connect(alice).faucet()).to.not.be.reverted;
      expect(await token.balanceOf(alice.address)).to.equal(ethers.parseEther("20"));
    });

    it("secondsUntilNextClaim 能正确倒计时", async function () {
      const { token, alice } = await loadFixture(deployFixture);

      expect(await token.secondsUntilNextClaim(alice.address)).to.equal(0);

      await token.connect(alice).faucet();
      expect(await token.secondsUntilNextClaim(alice.address)).to.equal(24 * 60 * 60);

      await time.increase(60 * 60); // 过 1 小时
      expect(await token.secondsUntilNextClaim(alice.address)).to.equal(23 * 60 * 60);
    });
  });

  describe("2. Guestbook —— approve 授权机制", function () {
    /** 帮 alice 准备好 10 枚币，并授权留言板花 1 枚。 */
    async function fundAndApprove(fixture) {
      const { token, guestbook, alice } = fixture;
      await token.connect(alice).faucet();
      await token
        .connect(alice)
        .approve(await guestbook.getAddress(), ONE_LEARN);

      return fixture;
    }

    it("没 approve 就留言 → 回滚（新手最常踩的坑）", async function () {
      const { token, guestbook, alice } = await loadFixture(deployFixture);
      await token.connect(alice).faucet(); // 有币，但没授权

      // ⚠️ 注意这里断言的是「自定义错误」而不是字符串：
      //    OpenZeppelin v5 的 transferFrom 在授权不足时直接 revert，
      //    抛的是 ERC20InsufficientAllowance，根本走不到我们那行 require。
      //    老版本 OZ / 某些非标准代币（如 USDT）行为不一样 —— 这正是
      //    "接入任意 ERC-20 都要小心" 的原因，也是审计里的高频考点。
      await expect(
        guestbook.connect(alice).post("你好，链上世界")
      ).to.be.revertedWithCustomError(token, "ERC20InsufficientAllowance");
    });

    it("授权够了但余额不够 → 同样回滚，币划不走", async function () {
      const { token, guestbook, bob } = await loadFixture(deployFixture);

      // bob 一分钱没有，却授权了 1 枚
      await token.connect(bob).approve(await guestbook.getAddress(), ONE_LEARN);

      await expect(guestbook.connect(bob).post("空手套白狼"))
        .to.be.revertedWithCustomError(token, "ERC20InsufficientBalance")
        .withArgs(bob.address, 0, ONE_LEARN);
    });

    it("approve 之后留言成功，并且真的扣了 1 枚币", async function () {
      const fixture = await loadFixture(deployFixture);
      const { token, guestbook, alice } = await fundAndApprove(fixture);

      await expect(guestbook.connect(alice).post("你好，链上世界"))
        .to.emit(guestbook, "NewMessage");

      // alice 领了 10 枚，花了 1 枚，剩 9 枚
      expect(await token.balanceOf(alice.address)).to.equal(ethers.parseEther("9"));
      // 币进了留言板合约 —— 这就是"协议收入"
      expect(await token.balanceOf(await guestbook.getAddress())).to.equal(ONE_LEARN);

      expect(await guestbook.totalMessages()).to.equal(1);
      expect(await guestbook.postCount(alice.address)).to.equal(1);

      const msg = await guestbook.getMessage(0);
      expect(msg.author).to.equal(alice.address);
      expect(msg.content).to.equal("你好，链上世界");
    });

    it("留言内容不能为空、不能超长", async function () {
      const fixture = await loadFixture(deployFixture);
      const { guestbook, alice } = await fundAndApprove(fixture);

      await expect(guestbook.connect(alice).post("")).to.be.revertedWith(
        "Guestbook: empty message"
      );

      await expect(
        guestbook.connect(alice).post("x".repeat(201))
      ).to.be.revertedWith("Guestbook: message too long");
    });

    it("多条留言按顺序存下来，getAllMessages 全部返回", async function () {
      const fixture = await loadFixture(deployFixture);
      const { token, guestbook, alice, bob } = await fundAndApprove(fixture);

      // bob 也来留言
      await token.connect(bob).faucet();
      await token.connect(bob).approve(await guestbook.getAddress(), ONE_LEARN);

      await guestbook.connect(alice).post("第一条：alice");
      await guestbook.connect(bob).post("第二条：bob");

      const all = await guestbook.getAllMessages();
      expect(all.length).to.equal(2);
      expect(all[0].content).to.equal("第一条：alice");
      expect(all[1].content).to.equal("第二条：bob");
      expect(all[1].author).to.equal(bob.address);
    });
  });

  describe("3. 权限与提现", function () {
    it("只有部署者能提走合约里的手续费", async function () {
      const fixture = await loadFixture(deployFixture);
      const { token, guestbook, alice, deployer } = fixture;

      await token.connect(alice).faucet();
      await token.connect(alice).approve(await guestbook.getAddress(), ONE_LEARN);
      await guestbook.connect(alice).post("付费留言");

      // alice 不是 owner，提现必须失败
      await expect(
        guestbook.connect(alice).withdrawFees(alice.address)
      ).to.be.revertedWith("Guestbook: not owner");

      // owner 提现成功
      const before = await token.balanceOf(deployer.address);
      await expect(guestbook.connect(deployer).withdrawFees(deployer.address)).to.not
        .be.reverted;
      expect(await token.balanceOf(deployer.address)).to.equal(before + ONE_LEARN);
    });

    it("合约里没钱时提现会回滚", async function () {
      const { guestbook, deployer } = await loadFixture(deployFixture);

      await expect(
        guestbook.connect(deployer).withdrawFees(deployer.address)
      ).to.be.revertedWith("Guestbook: nothing to withdraw");
    });
  });
});
