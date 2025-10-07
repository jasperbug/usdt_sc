import { randomUUID } from "crypto";
import { ethers } from "ethers";
import { prisma } from "../prisma";
import { appConfig } from "../config";
import { factoryContract, feeAmountWei, minDonationWei } from "../blockchain";
import { logger } from "../logger";

export type CreateOrderInput = {
  amount: string;
  nickname?: string | null;
  message?: string | null;
};

export class OrderService {
  async createOrder(input: CreateOrderInput) {
    const amountWei = ethers.parseUnits(input.amount, appConfig.tokenDecimals);
    if (amountWei < minDonationWei) {
      throw new Error(`金額需大於或等於 ${appConfig.minDonationUsd} USDT`);
    }

    const orderId = randomUUID();
    const expiresAt = new Date(Date.now() + appConfig.orderExpiryMinutes * 60 * 1000);

    const predictedVault = await factoryContract.getPredicted(orderId);

    logger.info({ orderId, predictedVault }, "Deploying vault for order");

    const tx = await factoryContract.deployVault(
      orderId,
      appConfig.vaultOwner,
      appConfig.treasury,
      appConfig.feeTreasury
    );
    const receipt = await tx.wait();

    const donation = await prisma.donation.create({
      data: {
        orderId,
        vaultAddress: predictedVault,
        expectedAmount: amountWei,
        feeAmount: feeAmountWei,
        minimumRequired: amountWei,
        status: "CREATED",
        nickname: input.nickname ?? null,
        message: input.message ?? null,
        expiresAt,
        chainId: appConfig.chainId,
      },
    });

    logger.info({ orderId, txHash: receipt?.hash, vault: predictedVault }, "Order created");

    return {
      donation,
      deployTxHash: tx.hash,
      predictedVault,
    };
  }

  async getOrder(orderId: string) {
    return prisma.donation.findUnique({ where: { orderId } });
  }

  async markPending(orderId: string, params: { txHash: string; amountWei: bigint }) {
    return prisma.donation.update({
      where: { orderId },
      data: {
        status: "PENDING",
        depositTx: params.txHash,
        actualAmount: params.amountWei,
      },
    });
  }

  async markUnderpaid(orderId: string, params: { txHash: string; amountWei: bigint }) {
    return prisma.donation.update({
      where: { orderId },
      data: {
        status: "UNDERPAID",
        depositTx: params.txHash,
        actualAmount: params.amountWei,
      },
    });
  }

  async markExpired(orderIds: string[]) {
    if (orderIds.length === 0) return;
    await prisma.donation.updateMany({
      where: {
        orderId: { in: orderIds },
        status: { in: ["CREATED", "UNDERPAID"] },
      },
      data: { status: "EXPIRED" },
    });
  }

  async markSwept(orderId: string, sweepTx: string) {
    return prisma.donation.update({
      where: { orderId },
      data: {
        status: "SWEPT",
        sweepTx,
      },
    });
  }
}

export const orderService = new OrderService();
