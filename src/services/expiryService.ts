import { prisma } from "../prisma";
import { logger } from "../logger";
import { appConfig } from "../config";
import { orderService } from "./orderService";

export class ExpiryService {
  private interval: NodeJS.Timeout | null = null;

  start() {
    if (this.interval) return;
    this.interval = setInterval(() => {
      this.expire().catch((err) => logger.error({ err }, "expiry job error"));
    }, 30_000);
    logger.info("Expiry service started");
  }

  stop() {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
  }

  private async expire() {
    const now = new Date();
    const expiredOrders = await prisma.donation.findMany({
      where: {
        status: { in: ["CREATED", "UNDERPAID"] },
        expiresAt: { lt: now },
      },
      select: { orderId: true },
    });

    if (expiredOrders.length === 0) {
      return;
    }

    const ids = expiredOrders.map((o) => o.orderId);
    await orderService.markExpired(ids);
    logger.info({ count: ids.length }, "Expired orders updated");
  }
}

export const expiryService = new ExpiryService();
