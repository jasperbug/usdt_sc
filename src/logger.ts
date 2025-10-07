import pino from "pino";

const baseOptions = {
  level: process.env.LOG_LEVEL || "info",
};

const isProduction = process.env.NODE_ENV === "production";

export const logger = isProduction
  ? pino(baseOptions)
  : pino({
      ...baseOptions,
      transport: {
        target: "pino-pretty",
        options: {
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        },
      },
    });
