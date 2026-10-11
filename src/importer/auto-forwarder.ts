import { Bot } from "grammy";
import { loadConfig } from "../config/env.js";
import { connectDatabase, closeDatabase } from "../db/client.js";
import { ensureIndexes } from "../db/indexes.js";
import { logger } from "../shared/logger.js";
import { runAutoForwarderService } from "./forwarder-service.js";

const config = loadConfig();
const controller = new AbortController();
process.once("SIGINT", () => controller.abort());
process.once("SIGTERM", () => controller.abort());

let db: Awaited<ReturnType<typeof connectDatabase>> | undefined;

try {
  if (!config.TELEGRAM_API_ID || !config.TELEGRAM_API_HASH || !config.TELEGRAM_USER_SESSION) {
    throw new Error("Configure TELEGRAM_API_ID, TELEGRAM_API_HASH and TELEGRAM_USER_SESSION before running the standalone forwarder.");
  }

  db = await connectDatabase(config);
  await ensureIndexes(db);

  const bot = new Bot(config.BOT_TOKEN, { client: { apiRoot: config.BOT_API_ROOT } });
  const botIdentity = await bot.api.getMe();
  if (!botIdentity.username) {
    throw new Error("Bot username could not be resolved from BOT_TOKEN.");
  }

  await runAutoForwarderService({
    config,
    db,
    botUsername: botIdentity.username,
    signal: controller.signal
  });
} catch (error) {
  logger.error("MTProto auto-forwarder stopped with an error", {
    error: error instanceof Error ? error.message : String(error)
  });
  process.exitCode = 1;
} finally {
  if (db) await closeDatabase();
}
