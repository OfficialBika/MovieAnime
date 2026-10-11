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
  await db.collection("helper_routes").createIndex(
    { targetChannelId: 1 }, { unique: true, name: "uniq_helper_target_channel" }
  );
  await db.collection("helper_users").createIndex(
    { enabled: 1, userId: 1 }, { name: "helper_users_enabled" }
  );
  await db.collection("helper_review_items").createIndex(
    { status: 1, updatedAt: 1 }, { name: "helper_review_status" }
  );
  await db.collection("helper_submissions").createIndex(
    { status: 1, updatedAt: 1 }, { name: "helper_submission_status" }
  );
  await db.collection("auto_forward_routes").createIndex(
    { enabled: 1, updatedAt: 1 }, { name: "auto_forward_routes_enabled" }
  );
  await db.collection("auto_forward_submissions").createIndex(
    { status: 1, updatedAt: 1 }, { name: "auto_forward_submission_status" }
  );
}
