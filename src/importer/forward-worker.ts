import { Api } from "teleproto";
import type { TelegramClient } from "teleproto";
import type { Db, Document } from "mongodb";
import type { AppConfig } from "../config/env.js";
import { classifyTeleprotoMedia } from "./media-classifier.js";
import { logger } from "../shared/logger.js";

interface AutoForwardRoute extends Document {
  _id: string;
  sourceChannelId: string;
  targetChannelId: string;
  enabled: boolean;
  lastProcessedMessageId?: number;
  updatedAt?: Date;
}

async function resolveAuthorizedChannel(
  client: TelegramClient,
  channelId: string,
  cache: Map<string, Api.Channel>
): Promise<Api.Channel> {
  const cached = cache.get(channelId);
  if (cached) return cached;
  if (!/^(-100[0-9]+)$/.test(channelId)) {
    throw new Error("Expected a Telegram source channel ID in -100… format.");
  }
  let found = false;
  for await (const dialog of client.iterDialogs({})) {
    if (String(dialog.id) === channelId) {
      found = true;
      break;
    }
  }
  if (!found) {
    throw new Error("Source channel is not in the session account's accessible dialogs. Join/open the source channel using the session account.");
  }
  const entity = await client.getEntity(Number(channelId));
  if (!(entity instanceof Api.Channel)) throw new Error("Configured source peer is not a channel.");
  cache.set(channelId, entity);
  return entity;
}

async function pollRoute(input: {
  client: TelegramClient;
  db: Db;
  route: AutoForwardRoute;
  botUsername: string;
  cache: Map<string, Api.Channel>;
  batchSize: number;
  signal: AbortSignal;
}): Promise<void> {
  const { client, db, route, botUsername, cache, batchSize, signal } = input;
  const routes = db.collection<AutoForwardRoute>("auto_forward_routes");
  const channel = await resolveAuthorizedChannel(client, route.sourceChannelId, cache);
  let cursor = route.lastProcessedMessageId;
  if (typeof cursor !== "number") {
    const latest = await client.getMessages(channel, { limit: 1 });
    cursor = latest[0]?.id ?? 0;
    await routes.updateOne(
      { _id: route._id, lastProcessedMessageId: { $exists: false } },
      { $set: { lastProcessedMessageId: cursor, updatedAt: new Date(), initializedAt: new Date() } }
    );
    logger.info("Auto-forward route initialized; existing posts will not be replayed", {
      sourceChannelId: route.sourceChannelId,
      targetChannelId: route.targetChannelId,
      lastProcessedMessageId: cursor
    });
    return;
  }

  for await (const message of client.iterMessages(channel, {
    minId: cursor,
    reverse: true,
    limit: batchSize
  })) {
    if (signal.aborted) return;
    if (typeof message.id !== "number" || message.id <= cursor) continue;
    const mediaType = classifyTeleprotoMedia(message.media);
    if (mediaType === "video") {
      await client.forwardMessages(botUsername, {
        messages: [message.id],
        fromPeer: channel
      });
      logger.info("Source video forwarded to Bot DM", {
        sourceChannelId: route.sourceChannelId,
        sourceMessageId: message.id
      });
    }
    cursor = message.id;
    await routes.updateOne(
      { _id: route._id, enabled: true },
      { $set: { lastProcessedMessageId: cursor, updatedAt: new Date() } }
    );
  }
}

export async function runAutoForwardWorker(input: {
  client: TelegramClient;
  db: Db;
  config: AppConfig;
  botUsername: string;
  signal: AbortSignal;
}): Promise<void> {
  const cache = new Map<string, Api.Channel>();
  const logTimes = new Map<string, number>();
  while (!input.signal.aborted) {
    const routes = await input.db.collection<AutoForwardRoute>("auto_forward_routes")
      .find({ enabled: true })
      .sort({ sourceChannelId: 1 })
      .toArray();
    for (const route of routes) {
      if (input.signal.aborted) break;
      try {
        await pollRoute({
          client: input.client,
          db: input.db,
          route,
          botUsername: input.botUsername,
          cache,
          batchSize: input.config.IMPORT_BATCH_SIZE,
          signal: input.signal
        });
        logTimes.delete(route.sourceChannelId);
      } catch (error) {
        const now = Date.now();
        const lastLogged = logTimes.get(route.sourceChannelId) ?? 0;
        if (now - lastLogged >= 60_000) {
          logger.warn("Auto-forward source route could not be processed; will retry", {
            sourceChannelId: route.sourceChannelId,
            targetChannelId: route.targetChannelId,
            error: error instanceof Error ? error.message : String(error)
          });
          logTimes.set(route.sourceChannelId, now);
        }
      }
    }
    if (!input.signal.aborted) {
      await new Promise((resolve) => setTimeout(resolve, input.config.AUTO_FORWARD_POLL_INTERVAL_SECONDS * 1000));
    }
  }
}
