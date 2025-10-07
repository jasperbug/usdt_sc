const { ethers } = require("hardhat");

const USDT_ADDRESS = process.env.USDT_ADDRESS || "0x55d398326f99059fF775485246999027B3197955";
const VAULT_ADDRESS = process.env.VAULT_ADDRESS || "0x6e03D91Affcdc543AE7770fc88ca3188f03fe613";

async function main() {
  const [signer] = await ethers.getSigners();
  console.log("使用 signer:", signer.address);

  const vault = await ethers.getContractAt("Vault", VAULT_ADDRESS, signer);

  const token = await ethers.getContractAt("IERC20", USDT_ADDRESS, signer);
  const balance = await token.balanceOf(VAULT_ADDRESS);
  console.log("Vault 當前 USDT 餘額:", balance.toString());

  if (balance === 0n) {
    console.log("Vault 餘額為 0，不需要 sweep");
    return;
  }

  const tx = await vault.sweep(USDT_ADDRESS);
  console.log("送出 sweep 交易, hash:", tx.hash);

  const receipt = await tx.wait();
  console.log("sweep 完成, gasUsed:", receipt.gasUsed.toString());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
