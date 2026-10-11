import type { Api, RawApi } from "grammy";
import type { Db, Document } from "mongodb";
import { buildHelperCaption, type HelperMediaType } from "../helper/metadata.js";
import { parseResolution } from "../parser/resolution-parser.js";
import { logger } from "../shared/logger.js";

interface AutoForwardRoute extends Document {
  _id: string;
  sourceChannelId: string;
  targetChannelId: string;
  animeTitle: string;
  enabled: boolean;
}

function episodeNumberFromCaption(caption: string): number | undefined {
  const patterns = [
    /\(\s*(\d{1,5})\s*\)/i,
    /\b(?:episode|ep)\s*[#.:_-]?\s*(\d{1,5})\b/i,
    /အပိုင်း\\s*[-:#]?\\s*(\\d{1,5})/i
  ];
  for (const pattern of patterns) {
    const match = caption.match(pattern);
    if (match?.[1]) {
      const value = Number(match[1]);
      if (Number.isSafeInteger(value) && value >= 1 && value <= 100_000) return value;
    }
  }
  return undefined;
}

export type AutoForwardMediaResult =
  | { status: "route_not_found" }
  | { status: "duplicate" }
  | { status: "review"; reason: string }
  | { status: "delivered"; animeTitle: string; episodeNumber: number; resolution: string; targetChannelId: string };

export async function processAutoForwardMedia(input: {
  api: Api<RawApi>;
  db: Db;
  userId: number;
  sourceChatId: number;
  botMessageId: number;
  sourceChannelId: string;
  originalMessageId: number;
  caption: string;
  mediaType: HelperMediaType;
}): Promise<AutoForwardMediaResult> {
  const route = await input.db.collection<AutoForwardRoute>("auto_forward_routes")
    .findOne({ _id: input.sourceChannelId, enabled: true });
  if (!route) return { status: "route_not_found" };

  const submissionId = input.sourceChannelId + ":" + String(input.originalMessageId);
  const submissions = input.db.collection<Document>("auto_forward_submissions");
  const existing = await submissions.findOne({ _id: submissionId });
  if (existing && existing.status !== "failed") return { status: "duplicate" };

  const now = new Date();
  if (existing?.status === "failed") {
    await submissions.updateOne(
      { _id: submissionId },
      { $set: { status: "processing", updatedAt: now }, $unset: { lastError: "" } }
    );
  } else {
    try {
      await submissions.insertOne({
        _id: submissionId,
        status: "processing",
        sourceChannelId: input.sourceChannelId,
        originalMessageId: input.originalMessageId,
        sourceChatId: String(input.sourceChatId),
        botMessageId: input.botMessageId,
        userId: input.userId,
        targetChannelId: route.targetChannelId,
        createdAt: now,
        updatedAt: now
      });
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) {
        return { status: "duplicate" };
      }
      throw error;
    }
  }

  const episodeNumber = episodeNumberFromCaption(input.caption);
  const parsedResolution = parseResolution(input.caption);
  const metadata = episodeNumber && parsedResolution && parsedResolution !== "UNKNOWN"
    ? { animeTitle: route.animeTitle, episodeNumber, resolution: parsedResolution }
    : undefined;
  if (!metadata) {
    const reason = !episodeNumber ? "episode_number_not_found" : "resolution_not_found";
    const normalizedTitle = input.caption.trim();
    await input.db.collection<Document>("helper_review_items").updateOne(
      { _id: "auto-forward:" + submissionId },
      {
        $set: {
          sourceChatId: String(input.sourceChatId),
          sourceMessageId: input.botMessageId,
          originalSourceChannelId: input.sourceChannelId,
          originalSourceMessageId: input.originalMessageId,
          userId: input.userId,
          caption: input.caption,
          reason,
          normalizedTitle,
          kind: "auto_forward",
          status: "pending",
          updatedAt: new Date()
        },
        $setOnInsert: { createdAt: new Date() }
      },
      { upsert: true }
    );
    await submissions.updateOne(
      { _id: submissionId },
      { $set: { status: "review", reason, updatedAt: new Date() } }
    );
    return { status: "review", reason };
  }

  let copiedMessageId: number | undefined;
  let episodeId: string | undefined;
  try {
    const copied = await input.api.copyMessage(
      route.targetChannelId,
      input.sourceChatId,
      input.botMessageId,
      { caption: buildHelperCaption(metadata) }
    );
    copiedMessageId = copied.message_id;
    const writtenAt = new Date();

    await input.db.collection<Document>("anime_channels").updateOne(
      { telegramChannelId: route.targetChannelId },
      {
        $set: { enabled: true, updatedAt: writtenAt },
        $setOnInsert: {
          _id: route.targetChannelId,
          telegramChannelId: route.targetChannelId,
          title: metadata.animeTitle,
          createdAt: writtenAt,
          importStatus: "completed"
        }
      },
      { upsert: true }
    );
    const channel = await input.db.collection<Document>("anime_channels").findOne({
      telegramChannelId: route.targetChannelId
    });
    const animeId = String(channel?._id ?? route.targetChannelId);
    episodeId = animeId + ":" + String(metadata.episodeNumber);

    await input.db.collection<Document>("episodes").updateOne(
      { _id: episodeId },
      {
        $setOnInsert: {
          _id: episodeId,
          animeId,
          episodeNumber: metadata.episodeNumber,
          createdAt: writtenAt
        },
        $set: { updatedAt: writtenAt }
      },
      { upsert: true }
    );
    await input.db.collection<Document>("media_versions").updateOne(
      { sourceChannelId: route.targetChannelId, sourceMessageId: copiedMessageId },
      {
        $set: {
          _id: route.targetChannelId + ":" + String(copiedMessageId),
          episodeId,
          resolution: metadata.resolution,
          sourceChannelId: route.targetChannelId,
          sourceMessageId: copiedMessageId,
          mediaType: input.mediaType,
          available: true,
          indexedAt: writtenAt
        }
      },
      { upsert: true }
    );
    await submissions.updateOne(
      { _id: submissionId },
      {
        $set: {
          status: "delivered",
          targetChannelId: route.targetChannelId,
          targetMessageId: copiedMessageId,
          animeTitle: metadata.animeTitle,
          episodeNumber: metadata.episodeNumber,
          resolution: metadata.resolution,
          updatedAt: writtenAt
        }
      }
    );
    logger.info("Auto-forward media delivered", {
      sourceChannelId: input.sourceChannelId,
      originalMessageId: input.originalMessageId,
      targetChannelId: route.targetChannelId,
      targetMessageId: copiedMessageId,
      episodeNumber: metadata.episodeNumber,
      resolution: metadata.resolution
    });
    return {
      status: "delivered",
      animeTitle: metadata.animeTitle,
      episodeNumber: metadata.episodeNumber,
      resolution: metadata.resolution,
      targetChannelId: route.targetChannelId
    };
  } catch (error) {
    if (copiedMessageId !== undefined) {
      try {
        await input.api.deleteMessage(route.targetChannelId, copiedMessageId);
        await input.db.collection<Document>("media_versions").deleteOne({
          sourceChannelId: route.targetChannelId,
          sourceMessageId: copiedMessageId
        });
        if (episodeId) {
          const remaining = await input.db.collection<Document>("media_versions").findOne({ episodeId });
          if (!remaining) await input.db.collection<Document>("episodes").deleteOne({ _id: episodeId });
        }
      } catch (rollbackError) {
        logger.error("Auto-forward rollback failed", {
          submissionId,
          error: rollbackError instanceof Error ? rollbackError.message : String(rollbackError)
        });
      }
    }
    await submissions.updateOne(
      { _id: submissionId },
      { $set: { status: "failed", lastError: error instanceof Error ? error.message : String(error), updatedAt: new Date() } }
    );
    throw error;
  }
}
