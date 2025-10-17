import { prisma } from "../prisma";
import { logger } from "../logger";
import { appConfig } from "../config";
import { feeAmountWei, getVaultContract, usdtContract } from "../blockchain";
import { orderService } from "./orderService";

export class SweeperService {
  private interval: NodeJS.Timeout | null = null;
  private isRunning = false;

  start() {
    if (this.interval) return;
    this.interval = setInterval(() => {
      this.sweepPending().catch((err) => logger.error({ err }, "sweep error"));
    }, appConfig.sweepIntervalMs);
    logger.info({ intervalMs: appConfig.sweepIntervalMs }, "Sweeper started");
  }

  stop() {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
  }

  private async sweepPending() {
    if (this.isRunning) {
      logger.debug("Sweep already running; skipping this tick");
      return;
    }

    this.isRunning = true;

    try {
      const pendingOrders = await prisma.donation.findMany({
        where: { status: "PENDING" },
      });

      for (const order of pendingOrders) {
        try {
          const balance = await usdtContract.balanceOf(order.vaultAddress);
          if (balance < feeAmountWei) {
            logger.debug({ orderId: order.orderId, balance: balance.toString() }, "Vault balance too low, skipping sweep");
            continue;
          }

          const vault = getVaultContract(order.vaultAddress);
          const tx = await vault.sweep(appConfig.usdtAddress);
          logger.info({ orderId: order.orderId, txHash: tx.hash }, "Sweep transaction sent");
          const receipt = await tx.wait();
          const txHash = receipt?.hash ?? tx.hash;

          if (!receipt) {
            logger.warn({ orderId: order.orderId, txHash }, "Sweep receipt not yet available");
            continue;
          }

          await orderService.markSwept(order.orderId, txHash);
          logger.info({ orderId: order.orderId, blockNumber: receipt.blockNumber, txHash }, "Order swept successfully");
        } catch (error) {
          logger.error({ err: error, orderId: order.orderId }, "Failed to sweep vault");
        }
      }
    } finally {
      this.isRunning = false;
    }
  }
}

export const sweeperService = new SweeperService();
