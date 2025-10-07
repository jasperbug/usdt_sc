const { ethers } = require("hardhat");

const BLOCK = Number(process.env.BLOCK || 63737136);

async function main() {
  const block = await ethers.provider.getBlock(BLOCK, true);
  console.log("transactions type:", typeof block.transactions[0]);
  console.log("sample:", block.transactions[0]);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
