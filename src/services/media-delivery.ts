import { randomUUID } from "node:crypto";
import type { Api, RawApi } from "grammy";
import type { Db, Document } from "mongodb";
import type { MediaVersionDocument } from "../shared/types.js";
import { logger } from "../shared/logger.js";

interface DeliveryJobInsert extends Document {
  _id: string;
  chatId: string;
  messageIds: number[];
  deleteAt: Date;
  status: "pending" | "processing" | "completed" | "retry" | "failed";
  attempts: number;
  createdAt: Date;
  updatedAt: Date;
}

export async function deliverMedia(input: {
  api: Api<RawApi>;
  db: Db;
  userChatId: number;
  media: MediaVersionDocument;
  deleteDelaySeconds: number;
}): Promise<{ mediaMessageId: number; warningMessageId: number }> {
  const { api, db, userChatId, media, deleteDelaySeconds } = input;
  if (!Number.isInteger(deleteDelaySeconds) || deleteDelaySeconds < 60 || deleteDelaySeconds > 3600) {
    throw new Error("Delete delay must be an integer between 60 and 3600 seconds.");
  }

  const copied = await api.copyMessage(userChatId, Number(media.sourceChannelId), media.sourceMessageId);
  let warningMessageId: number | undefined;
  try {
    const minutes = Math.floor(deleteDelaySeconds / 60);
    const seconds = deleteDelaySeconds % 60;
    const durationText = seconds === 0
      ? `${minutes} မိနစ်`
      : minutes === 0
        ? `${seconds} စက္ကန့်`
        : `${minutes} မိနစ် ${seconds} စက္ကန့်`;
    const warning = await api.sendMessage(
      userChatId,
      `⏳ သတိပေးချက်\nနောက် ${durationText} ပြည့်ပါက ယခု Media ကို အလိုအလျောက် ဖျက်ပါမည်။\n📌 မဖျက်မီ ယခု Media ကို Saved Messages ထဲတွင် ကိုယ်တိုင်သိမ်းဆည်းထားပါ။`
    );
    warningMessageId = warning.message_id;

    await input.db.collection<DeliveryJobInsert>("delivery_jobs").insertOne({
      _id: randomUUID(),
      chatId: String(userChatId),
      messageIds: [copied.message_id, warningMessageId],
      deleteAt: new Date(Date.now() + deleteDelaySeconds * 1000),
      status: "pending",
      attempts: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    return { mediaMessageId: copied.message_id, warningMessageId };
  } catch (error) {
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