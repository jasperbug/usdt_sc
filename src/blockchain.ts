import { ethers } from "ethers";
import factoryArtifact from "../artifacts/contracts/VaultFactory.sol/VaultFactory.json";
import vaultArtifact from "../artifacts/contracts/Vault.sol/Vault.json";
import { appConfig } from "./config";
import { logger } from "./logger";

const ERC20_ABI = [
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "function balanceOf(address account) view returns (uint256)",
];

type FactoryContract = ethers.Contract & {
  getPredicted(orderId: string): Promise<string>;
  deployVault(
    orderId: string,
    owner: string,
    treasury: string,
    feeTreasury: string
  ): Promise<ethers.ContractTransactionResponse>;
};

type VaultContract = ethers.Contract & {
  sweep(token: string): Promise<ethers.ContractTransactionResponse>;
};

type Erc20Contract = ethers.Contract & {
  balanceOf(address: string): Promise<bigint>;
};

const network = { chainId: appConfig.chainId, name: "bsc" };

export const httpProvider = new ethers.JsonRpcProvider(appConfig.rpcUrl, network);

let tempWsProvider: ethers.WebSocketProvider | null = null;
if (appConfig.wsUrl) {
  try {
    tempWsProvider = new ethers.WebSocketProvider(appConfig.wsUrl, network);
  } catch (error) {
    logger.warn({ err: error }, "Failed to initialize WebSocket provider; continuing without it");
    tempWsProvider = null;
  }
}

export const wsProvider = tempWsProvider;

export const provider = httpProvider;
export const signer = new ethers.Wallet(appConfig.privateKey, provider);

export const factoryContract = new ethers.Contract(
  appConfig.factoryAddress,
  factoryArtifact.abi,
  signer
) as FactoryContract;

export const feeAmountWei = ethers.parseUnits(appConfig.fixedFeeUsd, appConfig.tokenDecimals);
export const minDonationWei = ethers.parseUnits(appConfig.minDonationUsd, appConfig.tokenDecimals);

export function getVaultContract(address: string): VaultContract {
  return new ethers.Contract(address, vaultArtifact.abi, signer) as VaultContract;
}

export const usdtContract = new ethers.Contract(
  appConfig.usdtAddress,
  ERC20_ABI,
  provider
) as Erc20Contract;

export const transferTopic = ethers.id("Transfer(address,address,uint256)");

provider.on("error", (error) => {
  logger.error({ err: error }, "RPC provider error");
});

if (wsProvider) {
  wsProvider.on("error", (error) => {
    logger.error({ err: error }, "WS provider error");
  });

  const rawSocket = (wsProvider as any)._websocket as {
    on: (event: string, listener: (...args: any[]) => void) => void;
  } | undefined;
  rawSocket?.on("error", (error: unknown) => {
    logger.error({ err: error }, "WS underlying socket error");
  });
  rawSocket?.on("close", (code: number, reason: Buffer) => {
    logger.warn({ code, reason: reason.toString() }, "WS provider connection closed");
  });
}
