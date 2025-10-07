const { ethers } = require("hardhat");

/**
 * 部署 VaultFactory，並視需要立刻建立第一個 Vault。
 *
 * 必要環境變數（部署 vault 時）
 *  - ORDER_ID：訂單識別字串
 *  - VAULT_OWNER：擁有 sweep 權限的地址
 *  - TREASURY：實況主收款地址
 *  - FEE_TREASURY：平台抽成地址
 *
 * 手續費設定
 *  - FEE_AMOUNT：固定手續費（預設 0.5）
 *  - FEE_DECIMALS：手續費對應的代幣小數位（預設 18）
 *
 * 範例：
 * ORDER_ID=demo-1 VAULT_OWNER=0x... TREASURY=0x... FEE_TREASURY=0x... \
 *   FEE_AMOUNT=0.5 FEE_DECIMALS=18 npx hardhat run scripts/deployFactory.js --network bsc
 */
async function main() {
  const feeAmountStr = process.env.FEE_AMOUNT || "0.5";
  const feeDecimals = Number(process.env.FEE_DECIMALS || 18);
  const feeAmount = ethers.parseUnits(feeAmountStr, feeDecimals);

  const [deployer] = await ethers.getSigners();

  console.log("部署帳號:", deployer.address);
  console.log("帳戶餘額:", (await ethers.provider.getBalance(deployer.address)).toString());
  console.log("固定手續費(wei):", feeAmount.toString());

  const factory = await ethers.deployContract("VaultFactory", [feeAmount]);
  await factory.waitForDeployment();

  console.log("VaultFactory 部署完成:", factory.target);

  const { ORDER_ID, VAULT_OWNER, TREASURY, FEE_TREASURY } = process.env;

  if (ORDER_ID && VAULT_OWNER && TREASURY && FEE_TREASURY) {
    const predicted = await factory.getPredicted(ORDER_ID);
    const salt = await factory.getSalt(ORDER_ID);

    console.log("預測 Vault 地址:", predicted);
    console.log("部署使用 salt:", salt);

    const tx = await factory.deployVault(ORDER_ID, VAULT_OWNER, TREASURY, FEE_TREASURY);
    const receipt = await tx.wait();

    console.log("Vault 部署完成，交易哈希:", receipt.hash);
    console.log("Vault 地址:", await factory.vaultForSalt(salt));
  } else {
    console.log("未提供 ORDER_ID/VAULT_OWNER/TREASURY/FEE_TREASURY，僅部署工廠");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
