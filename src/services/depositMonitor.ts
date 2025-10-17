import { ethers } from "ethers";
import { prisma } from "../prisma";
import { provider, transferTopic } from "../blockchain";
import { appConfig } from "../config";
import { logger } from "../logger";
import { orderService } from "./orderService";

const iface = new ethers.Interface([
  "event Transfer(address indexed from, address indexed to, uint256 value)",
]);

type ActiveDonation = Awaited<ReturnType<typeof prisma.donation.findMany>>[number];

type ProcessLogResult =
  | { status: "ok" }
  | { status: "retry"; topicBatchSize: number }
  | { status: "fail"; topicBatchSize: number };

type PollOutcome = "idle" | "success" | "rate_limited" | "error";

const MAX_CHUNK_RETRIES = 8;
const MIN_BLOCK_SPAN = 1;
const JITTER_RATIO = 0.2;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chunkArray<T>(items: T[], size: number): T[][] {
  if (size <= 0) {
    return [];
  }

  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export class DepositMonitor {
  private lastCheckedBlock: number | null = null;
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private stopped = false;
  private backoffDelayMs = 0;
  private currentTopicBatchSize = appConfig.logMaxAddressBatch;

  async start() {
    if (this.timer) return;
    this.stopped = false;
    const currentBlock = await provider.getBlockNumber();
    this.lastCheckedBlock = currentBlock;
    this.currentTopicBatchSize = appConfig.logMaxAddressBatch;
    logger.info({ currentBlock }, "Deposit monitor started");
    this.scheduleNextTick(0);
  }

  stop() {
    this.stopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
    this.backoffDelayMs = 0;
  }

  private scheduleNextTick(delayMs: number) {
    if (this.stopped) {
      return;
    }
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      void this.runCycle();
    }, delayMs);
  }

  private async runCycle() {
    if (this.isRunning || this.stopped) {
      return;
    }

    this.isRunning = true;
    let outcome: PollOutcome = "success";

    try {
      outcome = await this.poll();
    } catch (err) {
      outcome = "error";
      logger.error({ err }, "deposit poll error");
    } finally {
      this.isRunning = false;
    }

    if (this.stopped) {
      return;
    }

    if (outcome === "rate_limited" || outcome === "error") {
      const base = this.backoffDelayMs === 0
        ? appConfig.logRateLimitInitialBackoffMs
        : Math.min(this.backoffDelayMs * 2, appConfig.logRateLimitMaxBackoffMs);
      const jitter = Math.floor(base * JITTER_RATIO * Math.random());
      this.backoffDelayMs = base;
      const delayMs = base + jitter;

      if (outcome === "rate_limited") {
        logger.warn({ delayMs }, "Rate limit encountered; backing off");
      } else {
        logger.warn({ delayMs }, "Deposit poll failed; backing off");
      }

      this.scheduleNextTick(delayMs);
    } else {
      this.backoffDelayMs = 0;
      this.scheduleNextTick(appConfig.pollIntervalMs);
    }
  }

  private async poll(): Promise<PollOutcome> {
    if (this.lastCheckedBlock === null) {
      this.lastCheckedBlock = await provider.getBlockNumber();
      return "idle";
    }

    const currentBlock = await provider.getBlockNumber();
    if (currentBlock <= this.lastCheckedBlock) {
      return "idle";
    }

    const activeOrders = await prisma.donation.findMany({
      where: {
        status: { in: ["CREATED", "UNDERPAID"] },
      },
    });

    if (activeOrders.length === 0) {
      this.lastCheckedBlock = currentBlock;
      return "idle";
    }

    const topicEntries = activeOrders.map((order) => {
      const padded = ethers.zeroPadValue(order.vaultAddress, 32);
      return {
        topic: padded,
        lookupKey: padded.toLowerCase(),
        order,
      };
    });
    const ordersByTopic = new Map<string, ActiveDonation>();
    for (const entry of topicEntries) {
      ordersByTopic.set(entry.lookupKey, entry.order);
    }

    const topicChunks = chunkArray(
      topicEntries.map((entry) => entry.topic),
      this.currentTopicBatchSize
    );
    const startBlock = this.lastCheckedBlock + 1;
    const endBlock = currentBlock;

    let fromBlock = startBlock;
    while (fromBlock <= endBlock) {
      const remaining = endBlock - fromBlock + 1;
      let span = Math.min(appConfig.logMaxBlockSpan, remaining);
      let processed = false;
      let chunkRetryCount = 0;

      while (!processed && span > 0) {
        const toBlock = fromBlock + span - 1;
        const chunkResult = await this.processLogChunks(topicChunks, ordersByTopic, fromBlock, toBlock);

        if (chunkResult.status === "ok") {
          this.lastCheckedBlock = toBlock;
          fromBlock = toBlock + 1;
          processed = true;
        } else if (chunkResult.status === "retry") {
          chunkRetryCount += 1;
          this.reduceTopicBatchSize(chunkResult.topicBatchSize);
          const nextSpan = Math.max(MIN_BLOCK_SPAN, Math.floor(span / 2));

          if (this.backoffDelayMs === 0) {
            await delay(appConfig.logRateLimitInitialBackoffMs);
          }

          if (chunkRetryCount >= MAX_CHUNK_RETRIES && nextSpan === span) {
            logger.warn(
              {
                fromBlock,
                toBlock,
                topicBatchSize: chunkResult.topicBatchSize,
                retries: chunkRetryCount,
              },
              "Rate limited on minimal span; deferring remaining blocks"
            );
            this.reduceTopicBatchSize(chunkResult.topicBatchSize);
            return "rate_limited";
          }

          if (nextSpan === span) {
            // 已經不能再縮，仍要給上層機會判斷是否繼續
            chunkRetryCount = MAX_CHUNK_RETRIES;
          } else {
            span = nextSpan;
          }
        } else {
          return "error";
        }
      }

      if (!processed) {
        return "rate_limited";
      }
    }

    this.relaxTopicBatchSize();
    return "success";
  }

  private async processLogChunks(
    topicChunks: string[][],
    ordersByTopic: Map<string, ActiveDonation>,
    fromBlock: number,
    toBlock: number
  ): Promise<ProcessLogResult> {
    for (const topics of topicChunks) {
      if (topics.length === 0) {
        continue;
      }

      let logs;
      try {
        logs = await provider.getLogs({
          address: appConfig.usdtAddress,
          topics: [transferTopic, null, topics],
          fromBlock,
          toBlock,
        });
      } catch (error: any) {
        const message = error?.message ?? "unknown error";
        if (message.includes("triggered rate limit")) {
          logger.warn({ err: error, fromBlock, toBlock, topicBatchSize: topics.length }, "Rate limited while fetching logs; will retry with smaller span");
          return { status: "retry", topicBatchSize: topics.length };
        }

        logger.warn({ err: error, fromBlock, toBlock, topicBatchSize: topics.length }, "Failed to fetch logs chunk");
        return { status: "fail", topicBatchSize: topics.length };
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
    }

    return { status: "ok" };
  }

  private reduceTopicBatchSize(rateLimitedBatchSize: number) {
    if (this.currentTopicBatchSize <= 1) {
      return;
    }

    const next = Math.max(1, Math.floor(this.currentTopicBatchSize / 2));
    if (next < this.currentTopicBatchSize) {
      logger.warn(
        { previous: this.currentTopicBatchSize, next, rateLimitedBatchSize },
        "Reducing topic batch size due to rate limit"
      );
      this.currentTopicBatchSize = next;
    }
  }

  private relaxTopicBatchSize() {
    if (this.currentTopicBatchSize >= appConfig.logMaxAddressBatch) {
      return;
    }

    const next = Math.min(appConfig.logMaxAddressBatch, this.currentTopicBatchSize + 1);
    if (next > this.currentTopicBatchSize) {
      logger.debug({ previous: this.currentTopicBatchSize, next }, "Relaxing topic batch size");
      this.currentTopicBatchSize = next;
    }
  }
}

export const depositMonitor = new DepositMonitor();
