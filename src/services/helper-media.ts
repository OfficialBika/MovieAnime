import type { Api, RawApi } from "grammy";
import type { Db, Document } from "mongodb";
import { logger } from "../shared/logger.js";
import {
  buildHelperCaption,
  normalizeRouteKey,
  parseHelperMetadata,
  type HelperMediaType
} from "../helper/metadata.js";

interface StringDocument extends Document {
  _id: string;
}

interface EpisodeDocument extends Document {
  _id: string;
  animeId: string;
  episodeNumber: number;
  createdAt: Date;
  updatedAt: Date;
}

interface HelperUserDocument extends Document {
  _id: string;
  userId: number;
  enabled: boolean;
}

interface HelperRouteDocument extends Document {
  _id: string;
  animeTitle: string;
  animeId: string;
  targetChannelId: string;
  enabled: boolean;
}

interface HelperSubmissionDocument extends Document {
  _id: string;
  status: "processing" | "delivered" | "failed";
  sourceChatId: string;
  sourceMessageId: number;
  userId: number;
  targetChannelId?: string;
  targetMessageId?: number;
  updatedAt: Date;
  createdAt: Date;
}

export type HelperSubmissionResult =
  | { status: "unauthorized" }
  | { status: "duplicate" }
  | { status: "review"; reason: string }
  | { status: "route_not_found"; animeTitle: string }
  | { status: "delivered"; animeTitle: string; episodeNumber: number; resolution: string; targetChannelId: string };

async function saveReview(input: {
  db: Db;
  sourceChatId: number;
  sourceMessageId: number;
  userId: number;
  caption: string;
  reason: string;
  normalizedTitle: string;
}): Promise<void> {
  const now = new Date();
  const id = String(input.sourceChatId) + ":" + String(input.sourceMessageId);
  await input.db.collection<StringDocument>("helper_review_items").updateOne(
    { _id: id },
    {
      $set: {
        sourceChatId: String(input.sourceChatId),
        sourceMessageId: input.sourceMessageId,
        userId: input.userId,
        caption: input.caption,
        reason: input.reason,
        normalizedTitle: input.normalizedTitle,
        status: "pending",
        updatedAt: now
      },
      $setOnInsert: { createdAt: now }
    },
    { upsert: true }
  );
}

export async function processHelperMedia(input: {
  api: Api<RawApi>;
  db: Db;
  adminIds: ReadonlySet<number>;
  userId: number;
  sourceChatId: number;
  sourceMessageId: number;
  caption: string;
  mediaType: HelperMediaType;
}): Promise<HelperSubmissionResult> {
  const isHelper = input.adminIds.has(input.userId)
    ? true
    : Boolean(await input.db.collection<HelperUserDocument>("helper_users").findOne({
        _id: String(input.userId),
        enabled: true
      }));
  if (!isHelper) return { status: "unauthorized" };

  const parsed = parseHelperMetadata(input.caption, input.mediaType);
  if (parsed.status !== "valid") {
    await saveReview({
      db: input.db,
      sourceChatId: input.sourceChatId,
      sourceMessageId: input.sourceMessageId,
      userId: input.userId,
      caption: input.caption,
      reason: parsed.reason,
      normalizedTitle: parsed.normalizedTitle
    });
    return { status: "review", reason: parsed.reason };
  }

  const metadata = parsed.value;
  const routeKey = normalizeRouteKey(metadata.animeTitle);
  const route = await input.db.collection<HelperRouteDocument>("helper_routes").findOne({
    _id: routeKey,
    enabled: true
  });
  if (!route) {
    await saveReview({
      db: input.db,
      sourceChatId: input.sourceChatId,
      sourceMessageId: input.sourceMessageId,
      userId: input.userId,
      caption: input.caption,
      reason: "anime_route_not_found",
      normalizedTitle: metadata.animeTitle
    });
    return { status: "route_not_found", animeTitle: metadata.animeTitle };
  }

  const submissionId = String(input.sourceChatId) + ":" + String(input.sourceMessageId);
  const submissions = input.db.collection<HelperSubmissionDocument>("helper_submissions");
  const existing = await submissions.findOne({ _id: submissionId });
  if (existing) return { status: "duplicate" };

  const now = new Date();
  try {
    await submissions.insertOne({
      _id: submissionId,
      status: "processing",
      sourceChatId: String(input.sourceChatId),
      sourceMessageId: input.sourceMessageId,
      userId: input.userId,
      createdAt: now,
      updatedAt: now
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) {
      return { status: "duplicate" };
    }
    throw error;
  }

  let copiedMessageId: number | undefined;
  const episodeId = route.animeId + ":" + String(metadata.episodeNumber);
  try {
    const copied = await input.api.copyMessage(
      route.targetChannelId,
      input.sourceChatId,
      input.sourceMessageId,
      { caption: buildHelperCaption(metadata) }
    );
    copiedMessageId = copied.message_id;

    const writtenAt = new Date();
    await input.db.collection<EpisodeDocument>("episodes").updateOne(
      { _id: episodeId },
      {
        $setOnInsert: {
          _id: episodeId,
          animeId: route.animeId,
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
          animeTitle: route.animeTitle,
          episodeNumber: metadata.episodeNumber,
          resolution: metadata.resolution,
          updatedAt: writtenAt
        }
      }
    );

    return {
      status: "delivered",
      animeTitle: route.animeTitle,
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
        const remaining = await input.db.collection<Document>("media_versions").findOne({ episodeId });
        if (!remaining) await input.db.collection<EpisodeDocument>("episodes").deleteOne({ _id: episodeId });
      } catch (rollbackError) {
        logger.error("Helper delivery rollback failed", {
          submissionId,
          error: rollbackError instanceof Error ? rollbackError.message : String(rollbackError)
        });
      }
    }
    await submissions.updateOne(
      { _id: submissionId },
      {
        $set: {
          status: "failed",
          lastError: error instanceof Error ? error.message : String(error),
          updatedAt: new Date()
        }
      }
    );
    throw error;
  }
}
