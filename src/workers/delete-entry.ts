import { Bot } from "grammy";
import { loadConfig } from "../config/env.js";
import { connectDatabase, closeDatabase } from "../db/client.js";
import { recoverStaleJobs } from "./recovery-worker.js";
import { runDeleteWorker } from "./delete-worker.js";
import { logger } from "../shared/logger.js";

const config = loadConfig();
const bot = new Bot(config.BOT_TOKEN, { client: { apiRoot: config.BOT_API_ROOT } });
const db = await connectDatabase(config);
await recoverStaleJobs(db);
const abortController = new AbortController();
process.once("SIGINT", () => abortController.abort());
process.once("SIGTERM", () => abortController.abort());

try {
  logger.info("Delete worker started");
  await runDeleteWorker(bot.api, db, config.DELETE_WORKER_INTERVAL_SECONDS, abortController.signal);
} finally {
  await closeDatabase();
}