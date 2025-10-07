const { ethers } = require("hardhat");

async function main() {
  const address = process.env.ADDRESS || "0x08af4Aa3062dAD1b373200E2Fc9CcB46Cab5fd3a";
  const balance = await ethers.provider.getBalance(address);
  console.log(balance.toString());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
