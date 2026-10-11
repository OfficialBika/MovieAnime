import type { Document } from "mongodb";
import { loadConfig } from "../config/env.js";
import { connectDatabase, closeDatabase } from "../db/client.js";
import { ensureIndexes } from "../db/indexes.js";
import { logger } from "../shared/logger.js";
import { createGramJsClient } from "./gramjs-client.js";
import { runAutoForwardWorker } from "./forward-worker.js";

const config = loadConfig();
const controller = new AbortController();
process.once("SIGINT", () => controller.abort());
process.once("SIGTERM", () => controller.abort());

let client: ReturnType<typeof createGramJsClient> | undefined;
let db: Awaited<ReturnType<typeof connectDatabase>> | undefined;

try {
  db = await connectDatabase(config);
  await ensureIndexes(db);
  client = createGramJsClient(config);
  await client.connect();
  if (!(await client.checkAuthorization())) {
    throw new Error("Teleproto session is not authorized. Configure TELEGRAM_USER_SESSION securely.");
  }

  const sessionUser = await client.getMe();
  const { Bot } = await import("grammy");
  const bot = new Bot(config.BOT_TOKEN, { client: { apiRoot: config.BOT_API_ROOT } });
  const botIdentity = await bot.api.getMe();
  if (!botIdentity.username) throw new Error("Bot username could not be resolved from BOT_TOKEN.");

  const settings = db.collection<Document>("system_settings");
  const previous = await settings.findOne({ _id: "telegram_user_session" });
  const sessionUserId = String(sessionUser.id);
  await settings.updateOne(
    { _id: "telegram_user_session" },
    {
      $set: {
        userId: sessionUserId,
        username: sessionUser.username ?? null,
        botUsername: botIdentity.username,
        updatedAt: new Date()
      },
      $setOnInsert: { createdAt: new Date() }
    },
    { upsert: true }
  );

  if (previous?.userId !== sessionUserId || previous?.botUsername !== botIdentity.username || previous?.botChatStarted !== true) {
    await client.sendMessage(botIdentity.username, { message: "/start" });
    await settings.updateOne(
      { _id: "telegram_user_session" },
      { $set: { botChatStarted: true, botChatStartedAt: new Date(), updatedAt: new Date() } }
    );
    logger.info("Session account opened the Bot DM", { botUsername: botIdentity.username, sessionUserId });
  }

  logger.info("MTProto auto-forwarder started", {
    sessionUserId,
    botUsername: botIdentity.username,
    pollIntervalSeconds: config.AUTO_FORWARD_POLL_INTERVAL_SECONDS
  });
  await runAutoForwardWorker({
    client,
    db,
    config,
    botUsername: botIdentity.username,
    signal: controller.signal
  });
} catch (error) {
  logger.error("MTProto auto-forwarder stopped with an error", {
    error: error instanceof Error ? error.message : String(error)
  });
  process.exitCode = 1;
} finally {
  if (client) await client.disconnect();
  if (db) await closeDatabase();
}
