import { randomUUID } from "node:crypto";
import type { Api, RawApi } from "grammy";
import type { Db } from "mongodb";
import type { MediaVersionDocument } from "../shared/types.js";
import { logger } from "../shared/logger.js";

export interface DeliverMediaInput {
  api: Api<RawApi>;
  db: Db;
  userChatId: number;
  media: MediaVersionDocument;
  deleteDelaySeconds: number;
}

export async function deliverMedia(input: DeliverMediaInput): Promise<{ mediaMessageId: number; warningMessageId: number }> {
  const { api, db, userChatId, media, deleteDelaySeconds } = input;
  if (deleteDelaySeconds < 60 || deleteDelaySeconds > 3600) {
    throw new Error("Delete delay must be between 60 and 3600 seconds.");
  }

  // Telegram performs a server-side message copy; the video file is not downloaded to the bot VPS.
  const copied = await api.copyMessage(userChatId, Number(media.sourceChannelId), media.sourceMessageId);
  const deadline = new Date(Date.now() + deleteDelaySeconds * 1000);

  let warningMessageId: number | undefined;
  try {
    const warning = await api.sendMessage(
      userChatId,
      "⏳ သတိပေးချက်\nနောက် 5 မိနစ်ပြည့်ပါက ယခု Media ကို အလိုအလျောက် ဖျက်ပါမည်။\n📌 မဖျက်မီ ယခု Media ကို Saved Messages ထဲတွင် ကိုယ်တိုင်သိမ်းဆည်းထားပါ။"
    );
    warningMessageId = warning.message_id;

    const jobId = randomUUID();
    await db.collection("delivery_jobs").insertOne({
      _id: jobId,
      chatId: String(userChatId),
      messageIds: [copied.message_id, warningMessageId],
      deleteAt: deadline,
      status: "pending",
      attempts: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    logger.info("Media delivered and delete job scheduled", { userChatId, jobId, mediaMessageId: copied.message_id });
    return { mediaMessageId: copied.message_id, warningMessageId };
  } catch (error) {
    // Fail closed: if persistence or warning delivery fails, remove the media we already sent.
    try {
      await api.deleteMessage(userChatId, copied.message_id);
      if (warningMessageId !== undefined) await api.deleteMessage(userChatId, warningMessageId);
    } catch (cleanupError) {
      logger.error("Failed to roll back partially delivered media", {
        userChatId,
        originalError: error instanceof Error ? error.message : String(error),
        cleanupError: cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
      });
    }
    throw error;
  }
}