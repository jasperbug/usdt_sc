import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv();

const schema = z.object({
  PORT: z.coerce.number().default(3001),
  BSC_RPC_URL: z.string().min(1, "BSC_RPC_URL is required"),
  DEPLOYER_PRIVATE_KEY: z.string().min(1, "DEPLOYER_PRIVATE_KEY is required"),
  FACTORY_ADDRESS: z.string().min(1, "FACTORY_ADDRESS is required"),
  USDT_ADDRESS: z.string().min(1, "USDT_ADDRESS is required"),
  VAULT_OWNER: z.string().min(1, "VAULT_OWNER is required"),
  TREASURY_ADDRESS: z.string().min(1, "TREASURY_ADDRESS is required"),
  FEE_TREASURY_ADDRESS: z.string().min(1, "FEE_TREASURY_ADDRESS is required"),
  USDT_TOKEN_DECIMALS: z.coerce.number().int().positive().default(18),
  FIXED_FEE_USDT: z.string().default("0.5"),
  ORDER_EXPIRY_MINUTES: z.coerce.number().positive().default(10),
  POLL_INTERVAL_MS: z.coerce.number().positive().default(5000),
  SWEEP_INTERVAL_MS: z.coerce.number().positive().default(30000),
  MIN_DONATION_USDT: z.string().default("1"),
  CHAIN_ID: z.coerce.number().int().default(56),
});

const env = schema.parse(process.env);

export const appConfig = {
  port: env.PORT,
  rpcUrl: env.BSC_RPC_URL,
  privateKey: env.DEPLOYER_PRIVATE_KEY,
  factoryAddress: env.FACTORY_ADDRESS,
  usdtAddress: env.USDT_ADDRESS,
  vaultOwner: env.VAULT_OWNER,
  treasury: env.TREASURY_ADDRESS,
  feeTreasury: env.FEE_TREASURY_ADDRESS,
  tokenDecimals: env.USDT_TOKEN_DECIMALS,
  fixedFeeUsd: env.FIXED_FEE_USDT,
  orderExpiryMinutes: env.ORDER_EXPIRY_MINUTES,
  pollIntervalMs: env.POLL_INTERVAL_MS,
  sweepIntervalMs: env.SWEEP_INTERVAL_MS,
  minDonationUsd: env.MIN_DONATION_USDT,
  chainId: env.CHAIN_ID,
};
