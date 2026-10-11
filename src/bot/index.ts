import { Bot, GrammyError, HttpError } from "grammy";
import { loadConfig, parseAdminIds } from "../config/env.js";
import { connectDatabase, closeDatabase } from "../db/client.js";
import { ensureIndexes } from "../db/indexes.js";
import { CatalogRepository } from "../db/repositories/catalog.js";
import { logger } from "../shared/logger.js";
import { animeKeyboard, episodeKeyboard, resolutionKeyboard } from "./keyboards/index.js";
import { registerChannelIndexer } from "./register-indexer.js";

const config = loadConfig();
const admins = parseAdminIds(config.ADMIN_USER_IDS);
const db = await connectDatabase(config);
await ensureIndexes(db);
const catalog = new CatalogRepository(db);
const bot = new Bot(config.BOT_TOKEN, { client: { apiRoot: config.BOT_API_ROOT } });
registerChannelIndexer(bot, db);

bot.catch(({ error, ctx }) => {
  if (error instanceof GrammyError) {
    logger.error("Telegram API error", { method: error.method, error: error.description, updateId: ctx.update.update_id });
  } else if (error instanceof HttpError) {
    logger.error("Telegram network error", { error: error.message, updateId: ctx.update.update_id });
  } else {
    logger.error("Unhandled bot error", { error: error instanceof Error ? error.message : String(error), updateId: ctx.update.update_id });
  }
});

bot.command("start", async (ctx) => {
  const keyboard = [
    [{ text: "ဇာတ်လမ်းများ", callback_data: "catalog" }],
    ...(config.MAIN_CHANNEL_URL ? [[{ text: "Main Channel", url: config.MAIN_CHANNEL_URL }]] : [])
  ];
  await ctx.reply(
    "Anime ဇာတ်ကားပေါင်းစုံ ကြည့်ရန်\nကြည့်ရန် ဇာတ်လမ်းများကို အောက်ပါ Button မှ ရွေးချယ်ပါ။",
    { reply_markup: { inline_keyboard: keyboard } }
  );
});

bot.callbackQuery("catalog", async (ctx) => {
  const channels = await catalog.listEnabledChannels();
  await ctx.answerCallbackQuery();
  if (channels.length === 0) {
    await ctx.editMessageText("ဇာတ်လမ်းများ မရှိသေးပါ။ Admin က Channel များကို မှတ်ပုံတင်ပေးရန် လိုအပ်ပါသည်။");
    return;
  }
  await ctx.editMessageText("ကြည့်ရှုလိုသော ဇာတ်လမ်းကို ရွေးချယ်ပါ။", {
    reply_markup: animeKeyboard(channels)
  });
});

async function showEpisodes(ctx: Parameters<typeof bot.callbackQuery>[1] extends never ? never : any, animeId: string, page: number) {
  const channel = await catalog.getChannel(animeId);
  if (!channel) {
    await ctx.answerCallbackQuery({ text: "ဇာတ်လမ်းကို ရှာမတွေ့ပါ။", show_alert: true });
    return;
  }
  const [episodes, latest] = await Promise.all([
    catalog.listEpisodes(channel._id, page * 20, 20),
    catalog.latestEpisode(channel._id)
  ]);
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(`${channel.title}\n\nအပိုင်းကို ရွေးချယ်ပါ။`, {
    reply_markup: episodeKeyboard(channel._id, episodes, page, latest)
  });
}

bot.callbackQuery(/^anime:([^:]+):(\d+)$/, async (ctx) => {
  const animeId = ctx.match[1];
  const page = Number(ctx.match[2]);
  if (!animeId || !Number.isSafeInteger(page) || page < 0) {
    await ctx.answerCallbackQuery({ text: "ရွေးချယ်မှု မမှန်ကန်ပါ။", show_alert: true });
    return;
  }
  await showEpisodes(ctx, animeId, page);
});

bot.callbackQuery(/^page:([^:]+):(\d+)$/, async (ctx) => {
  const animeId = ctx.match[1];
  const page = Number(ctx.match[2]);
  if (!animeId || !Number.isSafeInteger(page) || page < 0) {
    await ctx.answerCallbackQuery({ text: "စာမျက်နှာ မမှန်ကန်ပါ။", show_alert: true });
    return;
  }
  await showEpisodes(ctx, animeId, page);
});

bot.callbackQuery(/^ep:([^:]+):(\d+)$/, async (ctx) => {
  const animeId = ctx.match[1];
  const episode = Number(ctx.match[2]);
  if (!animeId || !Number.isSafeInteger(episode) || episode < 1) {
    await ctx.answerCallbackQuery({ text: "အပိုင်းနံပါတ် မမှန်ကန်ပါ။", show_alert: true });
    return;
  }
  const channel = await catalog.getChannel(animeId);
  if (!channel) {
    await ctx.answerCallbackQuery({ text: "ဇာတ်လမ်းကို ရှာမတွေ့ပါ။", show_alert: true });
    return;
  }
  const media = await catalog.listResolutions(channel._id, episode);
  await ctx.answerCallbackQuery();
  if (!media.length) {
    await ctx.reply(`${channel.title} — အပိုင်း ${episode}\nMedia မရှိသေးပါ။`);
    return;
  }
  await ctx.reply(`${channel.title} — အပိုင်း ${episode}\nResolution ရွေးချယ်ပါ။`, {
    reply_markup: resolutionKeyboard(channel._id, media)
  });
});

bot.callbackQuery(/^media:(.+)$/, async (ctx) => {
  const mediaId = ctx.match[1];
  if (!mediaId) {
    await ctx.answerCallbackQuery({ text: "Media ID မမှန်ကန်ပါ။", show_alert: true });
    return;
  }
  const media = await catalog.getMediaById(mediaId);
  if (!media || !media.available) {
    await ctx.answerCallbackQuery({ text: "ဒီ Media ကို ယခုရယူလို့ မရနိုင်ပါ။", show_alert: true });
    return;
  }
  await ctx.answerCallbackQuery({ text: "Media ပို့ရန် Delivery Service ချိတ်ဆက်နေဆဲဖြစ်သည်။" });
});

bot.command("health", async (ctx) => {
  await ctx.reply("Bot process is online.");
});

bot.command("admin", async (ctx) => {
  if (!ctx.from || !admins.has(ctx.from.id)) {
    await ctx.reply("ဤ Command ကို Admin သာ အသုံးပြုနိုင်ပါသည်။");
    return;
  }
  await ctx.reply("Admin foundation: channel registration/import controls are not wired yet.");
});

const shutdown = async (signal: string) => {
  logger.info("Shutting down bot", { signal });
  bot.stop();
  await closeDatabase();
  process.exit(0);
};
process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

logger.info("Starting Anime bot", { nodeEnv: config.NODE_ENV });
await bot.start({
  allowed_updates: ["message", "callback_query", "channel_post", "edited_channel_post"],
  onStart: (info) => logger.info("Bot polling started", { username: info.username })
});