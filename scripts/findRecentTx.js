const { ethers } = require("hardhat");

const ADDRESS = process.env.ADDRESS || "0x08af4Aa3062dAD1b373200E2Fc9CcB46Cab5fd3a";
const START_BLOCK = Number(process.env.START_BLOCK || 63737120);
const END_BLOCK = Number(process.env.END_BLOCK || 63737420);

async function main() {
  const provider = ethers.provider;

  for (let block = START_BLOCK; block <= END_BLOCK; block++) {
    const blockData = await provider.getBlock(block, true);
    if (!blockData || !blockData.transactions) continue;

    for (const txHash of blockData.transactions) {
      const tx = await provider.getTransaction(txHash);
      if (tx && tx.from && tx.from.toLowerCase() === ADDRESS.toLowerCase()) {
        console.log(`Block ${block} - tx ${txHash}`);
        console.log(`  nonce: ${tx.nonce}, to: ${tx.to}, value: ${tx.value.toString()}`);
        console.log(`  gasPrice: ${tx.gasPrice?.toString()}, gasLimit: ${tx.gasLimit.toString()}`);
      }
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
