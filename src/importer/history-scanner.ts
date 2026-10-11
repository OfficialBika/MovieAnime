import { Api } from "telegram";
import type { TelegramClient } from "telegram";
import type { Db, Collection, Document } from "mongodb";
import { parseSourceMessage } from "../parser/episode-parser.js";
import { logger } from "../shared/logger.js";

interface ImportJob {
  _id: string;
  channelId: string;
  status: "pending" | "running" | "paused" | "completed" | "failed";
  cursorMessageId?: number;
  scannedCount: number;
  indexedCount: number;
  skippedCount: number;
  errorCount: number;
  leaseUntil?: Date;
  updatedAt: Date;
  lastError?: string;
}
interface ImportOptions {
  client: TelegramClient;
  db: Db;
  channelId: string;
  batchSize: number;
  signal?: AbortSignal;
}

/** Index metadata and source IDs only; this does not download any media. */
export async function scanChannelHistory(options: ImportOptions): Promise<void> {
  const { client, db, channelId, batchSize, signal } = options;
  const channel = await client.getEntity(channelId);
  const channelEntity = channel as Api.Channel;
  const channelDoc = await db.collection("anime_channels").findOne({ telegramChannelId: channelId, enabled: true });
  if (!channelDoc) throw new Error("Channel must be registered and enabled before import.");

  const jobs = db.collection<ImportJob>("import_jobs");
  const jobId = channelId;
  const now = new Date();
  const existing = await jobs.findOne({ _id: jobId });
  if (!existing) {
    await jobs.insertOne({_id:jobId, channelId, status:"running", scannedCount:0,indexedCount:0,skippedCount:0,errorCount:0,leaseUntil:new Date(Date.now()+60_000),updatedAt:now});
  } else {
    const claimed = await jobs.updateOne(
      {_id:jobId, $or:[{status:{$in:["pending","paused","failed"]}},{leaseUntil:{$lt:now}}]},
      {$set:{status:"running",leaseUntil:new Date(Date.now()+60_000),updatedAt:now}}
    );
    if (claimed.modifiedCount !== 1) throw new Error("Import job is already running elsewhere.");
  }

  const state = await jobs.findOne({_id:jobId});
  let cursor = state?.cursorMessageId;
  try {
    for (;;) {
      if (signal?.aborted) throw new Error("Import aborted");
      const page = await client.getMessages(channelEntity, { limit: batchSize, ...(cursor !== undefined ? { maxId: cursor } : {}) });
      if (!page.length) break;
      for (const message of page) {
        if (signal?.aborted) throw new Error("Import aborted");
        const text = message.message ?? "";
        const hasMedia = Boolean(message.media);
        const parsed = parseSourceMessage({
          channelId,
          messageId: message.id,
          text,
          hasMedia,
          ...(hasMedia ? {mediaType:"other" as const} : {}),
          date: new Date(message.date * 1000)
        });
        if (parsed.status === "valid") {
          const episodeId = `${String(channelDoc._id)}:${parsed.value.episodeNumber}`;
          await db.collection("episodes").updateOne(
            {_id:episodeId},
            {$setOnInsert:{_id:episodeId,animeId:String(channelDoc._id),episodeNumber:parsed.value.episodeNumber,createdAt:new Date()},$set:{updatedAt:new Date()}},
            {upsert:true}
          );
          await db.collection("media_versions").updateOne(
            {sourceChannelId:channelId,sourceMessageId:message.id},
            {$set:{episodeId,resolution:parsed.value.resolution ?? "UNKNOWN",sourceChannelId:channelId,sourceMessageId:message.id,mediaType:"other",available:true,indexedAt:new Date()}},
            {upsert:true}
          );
          await jobs.updateOne({_id:jobId},{$inc:{scannedCount:1,indexedCount:1}});
        } else if (parsed.status === "review") {
          await db.collection("review_items").updateOne(
            {sourceChannelId:channelId,sourceMessageId:message.id},
            {$set:{sourceChannelId:channelId,sourceMessageId:message.id,reason:parsed.reason,text:parsed.normalizedTitle,updatedAt:new Date()}},
            {upsert:true}
          );
          await jobs.updateOne({_id:jobId},{$inc:{scannedCount:1,errorCount:1}});
        } else {
          await jobs.updateOne({_id:jobId},{$inc:{scannedCount:1,skippedCount:1}});
        }
      }
      const oldest = page[page.length - 1];
      if (!oldest) break;
      cursor = oldest.id;
      await jobs.updateOne({_id:jobId},{$set:{cursorMessageId:cursor,leaseUntil:new Date(Date.now()+60_000),updatedAt:new Date()}});
      await new Promise(resolve => setTimeout(resolve,500));
    }
    await jobs.updateOne({_id:jobId},{$set:{status:"completed",leaseUntil:new Date(0),updatedAt:new Date()}});
  } catch (error) {
    await jobs.updateOne({_id:jobId},{$set:{status:"paused",leaseUntil:new Date(0),updatedAt:new Date(),lastError:error instanceof Error?error.message:String(error)}});
    throw error;
  }
}