const { ethers } = require("hardhat");

const USDT_ADDRESS = "0x55d398326f99059fF775485246999027B3197955";
const VAULT_ADDRESS = process.env.VAULT_ADDRESS || "0x6e03D91Affcdc543AE7770fc88ca3188f03fe613";
const TX_HASH = process.env.TX_HASH || "";

async function main() {
  if (!TX_HASH) {
    throw new Error("請透過 TX_HASH 環境變數提供交易哈希");
  }

  const provider = ethers.provider;
  const tx = await provider.getTransaction(TX_HASH);
  if (!tx) {
    console.log("找不到該交易");
    return;
  }

  console.log("交易基本資訊:");
  console.log("  hash:", tx.hash);
  console.log("  from:", tx.from);
  console.log("  to:", tx.to);
  console.log("  value:", tx.value.toString());
  console.log("  nonce:", tx.nonce);
  console.log("  gasPrice:", tx.gasPrice?.toString());
  console.log("  gasLimit:", tx.gasLimit.toString());

  const receipt = await provider.getTransactionReceipt(TX_HASH);
  if (!receipt) {
    console.log("交易尚未入塊");
    return;
  }

  console.log("receipt.status:", receipt.status);
  console.log("blockNumber:", receipt.blockNumber);
  console.log("gasUsed:", receipt.gasUsed.toString());

  const iface = new ethers.Interface([
    "event Transfer(address indexed from, address indexed to, uint256 value)"
  ]);

  const usdtTransfers = receipt.logs
    .filter((log) => log.address.toLowerCase() === USDT_ADDRESS.toLowerCase())
    .map((log) => iface.parseLog(log));

  if (usdtTransfers.length === 0) {
    console.log("此交易沒有偵測到 USDT Transfer 事件");
  } else {
    console.log("USDT Transfer 事件:");
    for (const parsed of usdtTransfers) {
      const { from, to, value } = parsed.args;
      console.log(`  from: ${from} -> to: ${to}, amount: ${value}`);
      if (to.toLowerCase() === VAULT_ADDRESS.toLowerCase()) {
        console.log("  ✅ 轉入目標 Vault");
      }
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
