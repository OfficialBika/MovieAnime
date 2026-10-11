import type { Context } from "grammy";
import type { Db } from "mongodb";
import { parseSourceMessage } from "../parser/episode-parser.js";
import { logger } from "../shared/logger.js";

export async function indexChannelPost(ctx: Context, db: Db): Promise<void> {
  const post = ctx.channelPost ?? ctx.editedChannelPost;
  if (!post) return;
  const channelId = String(post.chat.id);
  const messageId = post.message_id;
  const registered = await db.collection("anime_channels").findOne({ telegramChannelId: channelId, enabled: true });
  if (!registered) return;

  const video = post.video;
  const document = post.document;
  const mediaType = video ? "video" : document ? "document" : undefined;
  const caption = "caption" in post ? post.caption : undefined;
  const text = caption ?? ("text" in post ? post.text : "") ?? "";
  const parsed = parseSourceMessage({
    channelId,
    messageId,
    text,
    hasMedia: Boolean(video || document),
    ...(mediaType ? { mediaType } : {}),
    date: new Date(post.date * 1000)
  });
  if (parsed.status === "skip") {
    logger.debug("Channel post skipped", { channelId, messageId, reason: parsed.reason });
    return;
  }
  if (parsed.status === "review") {
    await db.collection("review_items").updateOne(
      { sourceChannelId: channelId, sourceMessageId: messageId },
      { $set: { sourceChannelId: channelId, sourceMessageId: messageId, reason: parsed.reason, text: parsed.normalizedTitle, updatedAt: new Date() } },
      { upsert: true }
    );
    return;
  }
  const animeId = String(registered._id);
  const episodeId = `${animeId}:${parsed.value.episodeNumber}`;
  await db.collection("episodes").updateOne(
    { _id: episodeId },
    { $setOnInsert: { _id: episodeId, animeId, episodeNumber: parsed.value.episodeNumber, createdAt: new Date() }, $set: { updatedAt: new Date() } },
    { upsert: true }
  );
  await db.collection("media_versions").updateOne(
    { sourceChannelId: channelId, sourceMessageId: messageId },
    { $set: {
      episodeId,
      resolution: parsed.value.resolution ?? "UNKNOWN",
      sourceChannelId: channelId,
      sourceMessageId: messageId,
      mediaType: mediaType ?? "other",
      available: true,
      indexedAt: new Date()
    } },
    { upsert: true }
  );
}