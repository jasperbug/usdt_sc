const { ethers } = require("hardhat");

/**
 * 在本地 Hardhat Network 上模擬完整流程：
 * 1. 部署 VaultFactory 與 MockERC20
 * 2. 建立單筆訂單 Vault
 * 3. 模擬觀眾轉帳（鑄造代幣到 Vault）
 * 4. 由 owner 呼叫 sweep()，驗證固定 0.5 手續費 + 剩餘全數分配
 *
 * 執行：
 * npx hardhat run scripts/demoOrderFlow.js
 *
 * 可透過環境變數調整參數：
 *  - ORDER_ID（預設: demo-order）
 *  - DEPOSIT_AMOUNT（預設: 10）
 *  - TOKEN_DECIMALS（預設: 6）
 *  - FEE_AMOUNT（預設: 0.5）
 */
async function main() {
  const orderId = process.env.ORDER_ID || "demo-order";
  const decimals = Number(process.env.TOKEN_DECIMALS || 6);
  const depositAmount = ethers.parseUnits(process.env.DEPOSIT_AMOUNT || "10", decimals);
  const feeAmount = ethers.parseUnits(process.env.FEE_AMOUNT || "0.5", decimals);

  const [deployer, owner, treasury, feeTreasury] = await ethers.getSigners();

  console.log("部署者:", deployer.address);
  console.log("owner:", owner.address);
  console.log("treasury:", treasury.address);
  console.log("feeTreasury:", feeTreasury.address);
  console.log("固定手續費 (wei):", feeAmount.toString());

  const factory = await ethers.deployContract("VaultFactory", [feeAmount]);
  await factory.waitForDeployment();
  console.log("VaultFactory 地址:", factory.target);

  const token = await ethers.deployContract("MockERC20", ["Mock USDT", "mUSDT", decimals]);
  await token.waitForDeployment();
  console.log("MockERC20 地址:", token.target);

  const predicted = await factory.getPredicted(orderId);
  console.log("預測 Vault 地址:", predicted);

  const tx = await factory.deployVault(orderId, owner.address, treasury.address, feeTreasury.address);
  await tx.wait();

  const salt = await factory.getSalt(orderId);
  const vaultAddr = await factory.vaultForSalt(salt);
  console.log("實際 Vault 地址:", vaultAddr);

  const vault = await ethers.getContractAt("Vault", vaultAddr);

  await token.mint(vaultAddr, depositAmount);
  console.log(`Vault 收到 ${depositAmount} 代幣`);

  const expectedFee = feeAmount;
  const expectedStreamer = depositAmount - expectedFee;

  const sweepTx = await vault.connect(owner).sweep(token.target);
  await sweepTx.wait();
  console.log("sweep 完成，交易哈希:", sweepTx.hash);

  console.log("treasury 餘額:", await token.balanceOf(treasury.address));
  console.log("feeTreasury 餘額:", await token.balanceOf(feeTreasury.address));
  console.log("預期 streamer:", expectedStreamer);
  console.log("預期 fee:", expectedFee);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
