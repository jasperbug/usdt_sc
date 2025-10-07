const { ethers } = require("hardhat");

const ADDRESS = process.env.ADDRESS || "0x08af4Aa3062dAD1b373200E2Fc9CcB46Cab5fd3a";
const START_BLOCK = Number(process.env.START_BLOCK || 63736000);
const END_BLOCK = Number(process.env.END_BLOCK || 63737500);

async function main() {
  const provider = ethers.provider;
  for (let block = START_BLOCK; block <= END_BLOCK; block++) {
    if (block % 50 === 0) {
      console.log(`Checking block ${block}`);
    }
    const nonce = await provider.getTransactionCount(ADDRESS, block);
    if (nonce > 0) {
      console.log(`Block ${block} nonce ${nonce}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
