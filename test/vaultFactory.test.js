const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("VaultFactory", function () {
  const decimals = 6;
  const fixedFee = ethers.parseUnits("0.5", decimals);

  async function deployFixture() {
    const [deployer, owner, treasury, feeTreasury, stranger] = await ethers.getSigners();

    const factory = await ethers.deployContract("VaultFactory", [fixedFee]);
    await factory.waitForDeployment();

    const token = await ethers.deployContract("MockERC20", ["Mock USDT", "mUSDT", decimals]);
    await token.waitForDeployment();

    return { factory, token, accounts: { deployer, owner, treasury, feeTreasury, stranger } };
  }

  it("deploys deterministic vaults and sweeps balances with fixed fee", async function () {
    const { factory, token, accounts } = await deployFixture();
    const { owner, treasury, feeTreasury, stranger } = accounts;

    const orderId = "order-123";
    const salt = await factory.getSalt(orderId);
    const predicted = await factory.getPredicted(orderId);

    await expect(
      factory.deployVault(orderId, owner.address, treasury.address, feeTreasury.address)
    )
      .to.emit(factory, "VaultDeployed")
      .withArgs(predicted, salt, owner.address, treasury.address, feeTreasury.address, fixedFee);

    const vaultAddress = await factory.vaultForSalt(salt);
    expect(vaultAddress).to.equal(predicted);

    const vault = await ethers.getContractAt("Vault", vaultAddress);

    expect(await vault.feeAmount()).to.equal(fixedFee);

    const depositAmount = ethers.parseUnits("10", decimals);
    const expectedFee = fixedFee;
    const expectedStreamer = depositAmount - expectedFee;

    await token.mint(vaultAddress, depositAmount);

    await expect(vault.connect(stranger).sweep(token.target)).to.be.revertedWithCustomError(
      vault,
      "NotOwner"
    );

    await expect(vault.connect(owner).sweep(token.target))
      .to.emit(vault, "Swept")
      .withArgs(owner.address, token.target, depositAmount, expectedFee);

    expect(await token.balanceOf(treasury.address)).to.equal(expectedStreamer);
    expect(await token.balanceOf(feeTreasury.address)).to.equal(expectedFee);

    await expect(vault.connect(owner).sweep(token.target)).to.be.revertedWithCustomError(
      vault,
      "InsufficientBalance"
    );
  });

  it("prevents reusing the same order id", async function () {
    const { factory, accounts } = await deployFixture();
    const { owner, treasury, feeTreasury } = accounts;

    const orderId = "duplicate-order";
    await factory.deployVault(orderId, owner.address, treasury.address, feeTreasury.address);

    const salt = await factory.getSalt(orderId);

    await expect(
      factory.deployVault(orderId, owner.address, treasury.address, feeTreasury.address)
    )
      .to.be.revertedWithCustomError(factory, "VaultAlreadyDeployed")
      .withArgs(salt);
  });

  it("reverts sweep when balance is below the fixed fee", async function () {
    const { factory, token, accounts } = await deployFixture();
    const { owner, treasury, feeTreasury } = accounts;

    const orderId = "small-deposit";
    await factory.deployVault(orderId, owner.address, treasury.address, feeTreasury.address);

    const vaultAddress = await factory.vaultForSalt(await factory.getSalt(orderId));
    const vault = await ethers.getContractAt("Vault", vaultAddress);

    const smallDeposit = ethers.parseUnits("0.4", decimals);
    await token.mint(vaultAddress, smallDeposit);

    await expect(vault.connect(owner).sweep(token.target)).to.be.revertedWithCustomError(
      vault,
      "InsufficientBalance"
    );
  });
});
