import pino from "pino";

const level = process.env.LOG_LEVEL ?? "info";

export const logger = pino({
  level,
  base: { app: "weeek-permissions-gateway" },
  redact: {
    paths: ["req.headers.authorization", "req.headers.cookie", "password"],
    remove: true,
  },
  transport:
    process.env.NODE_ENV === "production"
      ? undefined
      : { target: "pino-pretty", options: { colorize: true } },
});

export type Logger = typeof logger;
