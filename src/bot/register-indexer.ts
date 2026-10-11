import type { Bot } from "grammy";
import type { Db } from "mongodb";
import { indexChannelPost } from "../indexer/channel-posts.js";

export function registerChannelIndexer(bot: Bot, db: Db): void {
  bot.on(["channel_post", "edited_channel_post"], async (ctx) => {
    await indexChannelPost(ctx, db);
  });
}