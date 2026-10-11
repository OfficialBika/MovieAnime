import type { Db } from "mongodb";
import type { AppConfig } from "../config/env.js";
import { logger } from "../shared/logger.js";
import { createGramJsClient } from "./gramjs-client.js";
import { runAutoForwardWorker } from "./forward-worker.js";

const BASE_RETRY_SECONDS = 5;
const MAX_RETRY_SECONDS = 60;

function waitForRetry(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    const timer = setTimeout(finish, milliseconds);
    signal.addEventListener("abort", finish, { once: true });
    if (signal.aborted) finish();
  });
}

/**
 * Runs the MTProto auto-forwarder as a supervised background task.
 * It reuses the bot process's MongoDB connection and retries connection/session
 * failures without taking down Telegram Bot API polling.
 */
export async function runAutoForwarderService(input: {
  config: AppConfig;
  db: Db;
  botUsername: string;
  signal: AbortSignal;
}): Promise<void> {
  let failureCount = 0;

  while (!input.signal.aborted) {
    let client: ReturnType<typeof createGramJsClient> | undefined;
    try {
      client = createGramJsClient(input.config);
      await client.connect();
      if (!(await client.checkAuthorization())) {
        throw new Error("Teleproto session is not authorized. Check TELEGRAM_USER_SESSION securely.");
      }

      const sessionUser = await client.getMe();
      const settings = input.db.collection<any>("system_settings");
      const previous = await settings.findOne({ _id: "telegram_user_session" });
      const sessionUserId = String(sessionUser.id);

      await settings.updateOne(
        { _id: "telegram_user_session" },
        {
          $set: {
            userId: sessionUserId,
            username: sessionUser.username ?? null,
            botUsername: input.botUsername,
            updatedAt: new Date()
          },
          $setOnInsert: { createdAt: new Date() }
        },
        { upsert: true }
      );

      if (
        previous?.userId !== sessionUserId ||
        previous?.botUsername !== input.botUsername ||
        previous?.botChatStarted !== true
      ) {
        await client.sendMessage(input.botUsername, { message: "/start" });
        await settings.updateOne(
          { _id: "telegram_user_session" },
          { $set: { botChatStarted: true, botChatStartedAt: new Date(), updatedAt: new Date() } }
        );
        logger.info("Session account opened the Bot DM", {
          botUsername: input.botUsername,
          sessionUserId
        });
      }

      logger.info("MTProto auto-forwarder started", {
        sessionUserId,
        botUsername: input.botUsername,
        pollIntervalSeconds: input.config.AUTO_FORWARD_POLL_INTERVAL_SECONDS
      });

      await runAutoForwardWorker({
        client,
        db: input.db,
        config: input.config,
        botUsername: input.botUsername,
        signal: input.signal
      });

      if (!input.signal.aborted) {
        throw new Error("Auto-forward worker exited unexpectedly.");
      }
    } catch (error) {
      if (input.signal.aborted) break;
      failureCount += 1;
      const retryInSeconds = Math.min(
        MAX_RETRY_SECONDS,
        BASE_RETRY_SECONDS * (2 ** Math.min(failureCount - 1, 4))
      );
      logger.error("MTProto auto-forwarder failed; retrying", {
        attempt: failureCount,
        retryInSeconds,
        error: error instanceof Error ? error.message : String(error)
      });
      await waitForRetry(retryInSeconds * 1000, input.signal);
    } finally {
      if (client) {
        try {
          await client.disconnect();
        } catch (error) {
          logger.warn("MTProto client disconnect failed", {
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
    }
  }

  logger.info("MTProto auto-forwarder stopped");
}
