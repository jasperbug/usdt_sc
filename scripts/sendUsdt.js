const { ethers } = require("hardhat");

const USDT_ADDRESS = process.env.USDT_ADDRESS || "0x55d398326f99059fF775485246999027B3197955";
const TO_ADDRESS = process.env.TO_ADDRESS;
const AMOUNT = process.env.AMOUNT || "1";
const DECIMALS = Number(process.env.DECIMALS || 18);

async function main() {
  if (!TO_ADDRESS) {
    throw new Error("請透過 TO_ADDRESS 指定目標地址");
  }

  const [signer] = await ethers.getSigners();
  console.log("使用 signer:", signer.address);

  const token = await ethers.getContractAt("IERC20", USDT_ADDRESS, signer);

  const amount = ethers.parseUnits(AMOUNT, DECIMALS);
  console.log(`轉帳 ${AMOUNT} 代幣 (${amount}) 到 ${TO_ADDRESS}`);

  const tx = await token.transfer(TO_ADDRESS, amount);
  console.log("發送交易:", tx.hash);

  const receipt = await tx.wait();
  console.log("交易完成, gasUsed:", receipt.gasUsed.toString());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
