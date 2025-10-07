import { ethers } from "ethers";
import { prisma } from "../prisma";
import { provider, transferTopic } from "../blockchain";
import { appConfig } from "../config";
import { logger } from "../logger";
import { orderService } from "./orderService";

const iface = new ethers.Interface([
  "event Transfer(address indexed from, address indexed to, uint256 value)",
]);

export class DepositMonitor {
  private lastCheckedBlock: number | null = null;
  private interval: NodeJS.Timeout | null = null;

  async start() {
    if (this.interval) return;
    const currentBlock = await provider.getBlockNumber();
    this.lastCheckedBlock = currentBlock;
    this.interval = setInterval(() => {
      this.poll().catch((err) => logger.error({ err }, "deposit poll error"));
    }, appConfig.pollIntervalMs);
    logger.info({ currentBlock }, "Deposit monitor started");
  }

  stop() {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
  }

  private async poll() {
    if (this.lastCheckedBlock === null) {
      this.lastCheckedBlock = await provider.getBlockNumber();
      return;
    }

    const currentBlock = await provider.getBlockNumber();
    if (currentBlock <= this.lastCheckedBlock) {
      return;
    }

    const activeOrders = await prisma.donation.findMany({
      where: {
        status: { in: ["CREATED", "UNDERPAID"] },
      },
    });

    if (activeOrders.length === 0) {
      this.lastCheckedBlock = currentBlock;
      return;
    }

    const toTopics = activeOrders.map((order) => ethers.zeroPadValue(order.vaultAddress, 32));

    const logs = await provider.getLogs({
      address: appConfig.usdtAddress,
      topics: [transferTopic, null, toTopics],
      fromBlock: this.lastCheckedBlock + 1,
      toBlock: currentBlock,
    });

    const ordersByTopic = new Map<string, typeof activeOrders[number]>();
    for (const order of activeOrders) {
      ordersByTopic.set(ethers.zeroPadValue(order.vaultAddress, 32).toLowerCase(), order);
    }

    for (const log of logs) {
      const topic = log.topics[2]?.toLowerCase();
      if (!topic) continue;
      const order = ordersByTopic.get(topic);
      if (!order) continue;
      if (order.status === "EXPIRED") continue;
      if (order.expiresAt < new Date()) {
        logger.info({ orderId: order.orderId, txHash: log.transactionHash }, "Late payment detected; ignoring");
        continue;
      }

      let parsed: ethers.LogDescription | null = null;
      try {
        parsed = iface.parseLog(log);
      } catch (error) {
        logger.warn({ err: error, txHash: log.transactionHash }, "Failed to parse transfer log");
      }

      if (!parsed) {
        continue;
      }

      const amount = parsed.args.value as bigint;

      if (amount >= order.minimumRequired) {
        if (order.status !== "PENDING") {
          await orderService.markPending(order.orderId, {
            txHash: log.transactionHash,
            amountWei: amount,
          });
          logger.info({ orderId: order.orderId, amount: amount.toString(), txHash: log.transactionHash }, "Order marked as PENDING");
        }
      } else {
        await orderService.markUnderpaid(order.orderId, {
          txHash: log.transactionHash,
          amountWei: amount,
        });
        logger.warn({ orderId: order.orderId, amount: amount.toString(), txHash: log.transactionHash }, "Underpaid donation detected");
      }
    }

    this.lastCheckedBlock = currentBlock;
  }
}

export const depositMonitor = new DepositMonitor();
