import { Api } from "telegram";
import { Logger } from "telegram/extensions/Logger.js";
import type { TelegramClient } from "telegram";
import type { Db } from "mongodb";
import { parseSourceMessage } from "../parser/episode-parser.js";
import { logger } from "../shared/logger.js";

interface ImportOptions {
  client: TelegramClient;
  db: Db;
  channelId: string;
  batchSize: number;
  signal?: AbortSignal;
}

/**
 * Scans accessible channel history in descending message-id order.
 * This importer only indexes metadata and source message identifiers;
 * it does not download media. Use only channels you own or are authorized to index.
 */
export async function scanChannelHistory(options: ImportOptions): Promise<void> {
  const { client, db, channelId, batchSize, signal } = options;
  const channel = await client.getEntity(channelId);
  const channelEntity = channel as Api.Channel;
  const channelDoc = await db.collection("anime_channels").findOne({
    telegramChannelId: channelId,
    enabled: true
  });
  if (!channelDoc) throw new Error("Channel must be registered and enabled before import.");

  const jobId = channelId;
  const jobs = db.collection("import_jobs");
  const now = new Date();
  const claimed = await jobs.findOneAndUpdate(
    {
      _id: jobId,
      $or: [
        { status: { $in: ["pending", "paused", "failed"] } },
        { leaseUntil: { $lt: now } }
      ]
    },
    { $set: { status: "running", leaseUntil: new Date(Date.now() + 60_000), updatedAt: now } },
    { upsert: true, returnDocument: "after" }
  );
  if (!claimed) throw new Error("Import job is already running elsewhere.");

  let cursor = typeof claimed.cursorMessageId === "number" ? claimed.cursorMessageId : undefined;
  try {
    for (;;) {
      if (signal?.aborted) throw new Error("Import aborted");
      const page = await client.getMessages(channelEntity, {
        limit: batchSize,
        ...(cursor !== undefined ? { maxId: cursor } : {})
      });
      if (!page.length) break;

      // Telegram history comes newest-first by default. Index the batch, then move
      // maxId below the oldest message so the next batch does not repeat it.
      for (const message of page) {
        if (signal?.aborted) throw new Error("Import aborted");
        const messageId = message.id;
        const rawText = message.message ?? "";
        const hasVideo = Boolean(message.media);
        const parsed = parseSourceMessage({
          channelId,
          messageId,
          text: rawText,
          hasMedia: hasVideo,
          mediaType: hasVideo ? "other" : undefined,
          date: new Date(message.date * 1000)
        });

        if (parsed.status === "valid") {
          const episodeId = `${channelDoc._id}:${parsed.value.episodeNumber}`;
          await db.collection("episodes").updateOne(
            { _id: episodeId },
            { $setOnInsert: { _id: episodeId, animeId: channelDoc._id, episodeNumber: parsed.value.episodeNumber, createdAt: new Date() }, $set: { updatedAt: new Date() } },
            { upsert: true }
          );
          await db.collection("media_versions").updateOne(
            { sourceChannelId: channelId, sourceMessageId: messageId },
            { $set: {
              _id: `${channelId}:${messageId}`,
              episodeId,
              resolution: parsed.value.resolution ?? "UNKNOWN",
              sourceChannelId: channelId,
              sourceMessageId: messageId,
              mediaType: "other",
              available: true,
              indexedAt: new Date()
            } },
            { upsert: true }
          );
          await jobs.updateOne({ _id: jobId }, { $inc: { scannedCount: 1, indexedCount: 1 } });
        } else if (parsed.status === "review") {
          await db.collection("review_items").updateOne(
            { sourceChannelId: channelId, sourceMessageId: messageId },
            { $set: { sourceChannelId: channelId, sourceMessageId: messageId, reason: parsed.reason, text: parsed.normalizedTitle, updatedAt: new Date() } },
            { upsert: true }
          );
          await jobs.updateOne({ _id: jobId }, { $inc: { scannedCount: 1, errorCount: 1 } });
        } else {
          await jobs.updateOne({ _id: jobId }, { $inc: { scannedCount: 1, skippedCount: 1 } });
        }
      }

      const oldest = page[page.length - 1];
      if (!oldest) break;
      cursor = oldest.id;
      await jobs.updateOne(
        { _id: jobId },
        { $set: { cursorMessageId: cursor, leaseUntil: new Date(Date.now() + 60_000), updatedAt: new Date() } }
      );
      // Respect account limits: keep concurrency low and yield between batches.
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    await jobs.updateOne(
      { _id: jobId },
      { $set: { status: "completed", leaseUntil: new Date(0), updatedAt: new Date() } }
    );
  } catch (error) {
    await jobs.updateOne(
      { _id: jobId },
      { $set: { status: "paused", leaseUntil: new Date(0), updatedAt: new Date(), lastError: error instanceof Error ? error.message : String(error) } }
    );
    throw error;
  }
}