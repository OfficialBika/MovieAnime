import type { Bot, Context } from "grammy";
import type { Db, Document } from "mongodb";
import { processAutoForwardMedia } from "../services/auto-forward-media.js";
import { logger } from "../shared/logger.js";

interface SessionSettings extends Document {
  _id: string;
  userId: string;
}

function isVideoMessage(ctx: Context): "video" | "document" | undefined {
  if (!ctx.message) return undefined;
  if ("video" in ctx.message && ctx.message.video) return "video";
  if ("document" in ctx.message && ctx.message.document?.mime_type?.toLowerCase().startsWith("video/")) {
    return "document";
  }
  return undefined;
}

export function registerAutoForwardInbox(bot: Bot, db: Db): void {
  bot.on(["message:video", "message:document"], async (ctx, next) => {
    if (ctx.chat.type !== "private" || !ctx.from || !ctx.message) return next();
    const mediaType = isVideoMessage(ctx);
    if (!mediaType) return next();

    const origin = ctx.message.forward_origin;
    if (!origin || origin.type !== "channel") return next();

    const settings = await db.collection<SessionSettings>("system_settings").findOne({
      _id: "telegram_user_session"
    });
    if (!settings || String(settings.userId) !== String(ctx.from.id)) return next();

    const sourceChannelId = String(origin.chat.id);
    try {
      const result = await processAutoForwardMedia({
        api: ctx.api,
        db,
        userId: ctx.from.id,
        sourceChatId: ctx.chat.id,
        botMessageId: ctx.message.message_id,
        sourceChannelId,
        originalMessageId: origin.message_id,
        caption: ctx.message.caption ?? "",
        mediaType
      });
      if (result.status === "review") {
        logger.warn("Auto-forward video needs metadata review", {
          sourceChannelId,
          sourceMessageId: origin.message_id,
          reason: result.reason
        });
      } else if (result.status === "route_not_found") {
        logger.warn("Forwarded video has no active route", {
          sourceChannelId,
          sourceMessageId: origin.message_id
        });
      }
    } catch (error) {
      logger.error("Could not process video forwarded by session account", {
        sourceChannelId,
        sourceMessageId: origin.message_id,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
}
