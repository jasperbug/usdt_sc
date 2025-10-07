import express from "express";
import pinoHttp from "pino-http";
import { appConfig } from "./config";
import { logger } from "./logger";
import ordersRouter from "./routes/orders";
import { depositMonitor } from "./services/depositMonitor";
import { sweeperService } from "./services/sweeperService";
import { expiryService } from "./services/expiryService";

async function main() {
  const app = express();
  app.use(express.json());
  app.use(pinoHttp({ logger }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.use("/api/orders", ordersRouter);

  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error({ err }, "Unhandled error");
    res.status(400).json({ message: err.message ?? "Unexpected error" });
  });

  app.listen(appConfig.port, async () => {
    logger.info({ port: appConfig.port }, "Server started");
    await depositMonitor.start();
    sweeperService.start();
    expiryService.start();
  });
}

main().catch((err) => {
  logger.error({ err }, "Failed to start server");
  process.exit(1);
});
