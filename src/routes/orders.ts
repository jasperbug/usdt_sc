import { Router } from "express";
import { z } from "zod";
import { orderService } from "../services/orderService";
import { appConfig } from "../config";

const router = Router();

const createOrderSchema = z.object({
  amount: z.string().min(1),
  nickname: z.string().max(50).optional(),
  message: z.string().max(200).optional(),
});

router.post("/", async (req, res, next) => {
  try {
    const payload = createOrderSchema.parse(req.body);
    const result = await orderService.createOrder({
      amount: payload.amount,
      nickname: payload.nickname ?? null,
      message: payload.message ?? null,
    });
    const donation = result.donation;

    res.json({
      orderId: donation.orderId,
      status: donation.status,
      vaultAddress: donation.vaultAddress,
      expectedAmountWei: donation.expectedAmount.toString(),
      feeAmountWei: donation.feeAmount.toString(),
      minimumRequiredWei: donation.minimumRequired.toString(),
      expiresAt: donation.expiresAt,
      deployTxHash: result.deployTxHash,
      payment: {
        token: appConfig.usdtAddress,
        to: donation.vaultAddress,
        value: donation.expectedAmount.toString(),
        decimals: appConfig.tokenDecimals,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get("/:orderId", async (req, res, next) => {
  try {
    const order = await orderService.getOrder(req.params.orderId);
    if (!order) {
      res.status(404).json({ message: "Order not found" });
      return;
    }

    res.json({
      orderId: order.orderId,
      status: order.status,
      vaultAddress: order.vaultAddress,
      expectedAmountWei: order.expectedAmount.toString(),
      actualAmountWei: order.actualAmount?.toString() ?? null,
      feeAmountWei: order.feeAmount.toString(),
      minimumRequiredWei: order.minimumRequired.toString(),
      expiresAt: order.expiresAt,
      depositTx: order.depositTx,
      sweepTx: order.sweepTx,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
