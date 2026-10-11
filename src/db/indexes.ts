import type { Db } from "mongodb";

export async function ensureIndexes(db: Db): Promise<void> {
  await db.collection("anime_channels").createIndex(
    { telegramChannelId: 1 }, { unique: true, name: "uniq_telegram_channel" }
  );
  await db.collection("episodes").createIndex(
    { animeId: 1, episodeNumber: 1 }, { unique: true, name: "uniq_anime_episode" }
  );
  await db.collection("media_versions").createIndex(
    { sourceChannelId: 1, sourceMessageId: 1 }, { unique: true, name: "uniq_source_message" }
  );
  await db.collection("media_versions").createIndex(
    { episodeId: 1, resolution: 1 }, { name: "episode_resolution" }
  );
  await db.collection("media_versions").createIndex(
    { sourceChannelId: 1, sourceMessageId: 1, available: 1 }, { name: "source_availability" }
  );
  await db.collection("delivery_jobs").createIndex(
    { status: 1, deleteAt: 1 }, { name: "due_delete_jobs" }
  );
  await db.collection("import_jobs").createIndex(
    { channelId: 1, status: 1 }, { name: "channel_import_status" }
  );
  await db.collection("review_items").createIndex(
    { sourceChannelId: 1, sourceMessageId: 1 }, { unique: true, name: "uniq_review_source" }
  );
}