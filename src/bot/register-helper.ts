import type { Bot, Context } from "grammy";
import type { Db, Document } from "mongodb";
import { normalizeRouteKey } from "../helper/metadata.js";
import { processHelperMedia } from "../services/helper-media.js";
import { processAutoForwardMedia } from "../services/auto-forward-media.js";
import { logger } from "../shared/logger.js";

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

function isAdmin(ctx: Context, admins: ReadonlySet<number>): boolean {
  return Boolean(ctx.from && admins.has(ctx.from.id));
}

async function requireAdmin(ctx: Context, admins: ReadonlySet<number>): Promise<boolean> {
  if (isAdmin(ctx, admins)) return true;
  await ctx.reply("ဤ Command ကို Admin သာ အသုံးပြုနိုင်ပါသည်။");
  return false;
}

export function registerHelperSystem(bot: Bot, db: Db, admins: ReadonlySet<number>): void {
  bot.command("addhelper", async (ctx) => {
    if (!(await requireAdmin(ctx, admins))) return;
    const raw = (ctx.match ?? "").trim();
    const userId = Number(raw);
    if (!/^\d{1,16}$/.test(raw) || !Number.isSafeInteger(userId) || userId <= 0) {
      await ctx.reply("အသုံးပြုပုံ: /addhelper 123456789\nHelper ရဲ့ Telegram User ID ကို ထည့်ပါ။");
      return;
    }
    const now = new Date();
    await db.collection<HelperUserDocument>("helper_users").updateOne(
      { _id: String(userId) },
      {
        $set: { userId, enabled: true, updatedAt: now },
        $setOnInsert: { createdAt: now, createdBy: String(ctx.from?.id ?? "") }
      },
      { upsert: true }
    );
    await ctx.reply("Helper မှတ်ပုံတင်ပြီးပါပြီ။\nUser ID: " + String(userId) + "\nHelper က Bot ကို Private Chat မှာ Video ပို့နိုင်ပါပြီ။");
  });

  bot.command("helpers", async (ctx) => {
    if (!(await requireAdmin(ctx, admins))) return;
    const helpers = await db.collection<Document>("helper_users").find({ enabled: true }).sort({ userId: 1 }).toArray();
    await ctx.reply(helpers.length
      ? "မှတ်ပုံတင်ထားသော Helper များ:\n" + helpers.map((item) => "• " + String(item.userId)).join("\n")
      : "Helper မရှိသေးပါ။ /addhelper USER_ID");
  });

  bot.command("removehelper", async (ctx) => {
    if (!(await requireAdmin(ctx, admins))) return;
    const raw = (ctx.match ?? "").trim();
    const userId = Number(raw);
    if (!/^\d{1,16}$/.test(raw) || !Number.isSafeInteger(userId) || userId <= 0) {
      await ctx.reply("အသုံးပြုပုံ: /removehelper 123456789");
      return;
    }
    const result = await db.collection<HelperUserDocument>("helper_users").updateOne(
      { _id: String(userId) },
      { $set: { enabled: false, updatedAt: new Date() } }
    );
    await ctx.reply(result.matchedCount ? "Helper ကို ပိတ်ပြီးပါပြီ။" : "ဒီ User ID ကို မတွေ့ပါ။");
  });

  bot.command("addroute", async (ctx) => {
    if (!(await requireAdmin(ctx, admins))) return;
    const parts = (ctx.match ?? "").split("|").map((part) => part.trim());
    if (parts.length !== 2 || !parts[0] || parts[0].length > 100 || !/^-?\d{5,20}$/.test(parts[1] ?? "")) {
      await ctx.reply(
        "အသုံးပြုပုံ:\n/addroute Anime Name | -1001234567890\nPrivate Channel ထဲ Bot ကို Post Messages ခွင့်ရှိသော Admin ထည့်ထားပါ။"
      );
      return;
    }
    const animeTitle = parts[0];
    const targetChannelId = parts[1]!;
    const routeKey = normalizeRouteKey(animeTitle);
    if (!routeKey) {
      await ctx.reply("Anime အမည် မမှန်ကန်ပါ။");
      return;
    }

    try {
      const chat = await ctx.api.getChat(targetChannelId);
      if (chat.type !== "channel") {
        await ctx.reply("Destination သည် Telegram Channel ဖြစ်ရပါမည်။");
        return;
      }
      const botInfo = await ctx.api.getMe();
      const member = await ctx.api.getChatMember(targetChannelId, botInfo.id);
      if (member.status !== "creator" && member.status !== "administrator") {
        await ctx.reply("Bot ကို Private Channel ထဲ Admin အဖြစ် ထည့်ထားရန် လိုအပ်ပါသည်။");
        return;
      }
      if (member.status === "administrator" && !member.can_post_messages) {
        await ctx.reply("Bot Admin မှာ Post Messages ခွင့်ကို ဖွင့်ပေးပါ။");
        return;
      }

      const previous = await db.collection<any>("helper_routes").findOne({ _id: routeKey });
      if (previous?.targetChannelId && previous.targetChannelId !== targetChannelId) {
        await db.collection<Document>("anime_channels").updateOne(
          { telegramChannelId: previous.targetChannelId },
          { $set: { enabled: false, updatedAt: new Date() } }
        );
      }

      const now = new Date();
      await db.collection<Document>("anime_channels").updateOne(
        { telegramChannelId: targetChannelId },
        {
          $set: { telegramChannelId: targetChannelId, title: animeTitle, enabled: true, updatedAt: now },
          $setOnInsert: { _id: targetChannelId, createdAt: now, importStatus: "pending" }
        },
        { upsert: true }
      );
      const animeChannel = await db.collection<Document>("anime_channels").findOne({ telegramChannelId: targetChannelId });
      if (!animeChannel) throw new Error("Could not load the destination anime channel after registration.");
      const animeId = String(animeChannel._id);

      await db.collection<any>("helper_routes").updateOne(
        { _id: routeKey },
        {
          $set: { animeTitle, animeId, targetChannelId, enabled: true, updatedAt: now },
          $setOnInsert: { createdAt: now, createdBy: String(ctx.from?.id ?? "") }
        },
        { upsert: true }
      );
      await ctx.reply("Helper Route သိမ်းဆည်းပြီးပါပြီ။\nAnime: " + animeTitle + "\nPrivate Channel ID: " + targetChannelId);
    } catch (error) {
      logger.warn("Helper route registration failed", {
        animeTitle,
        targetChannelId,
        error: error instanceof Error ? error.message : String(error)
      });
      await ctx.reply("Channel ကို စစ်ဆေး/မှတ်ပုံတင်လို့ မရပါ။ Bot Admin နဲ့ Channel ID ကို စစ်ပြီး ပြန်ကြိုးစားပါ။");
    }
  });

  bot.command("routes", async (ctx) => {
    if (!(await requireAdmin(ctx, admins))) return;
    const routes = await db.collection<any>("helper_routes").find({ enabled: true }).sort({ animeTitle: 1 }).toArray();
    await ctx.reply(routes.length
      ? "အသုံးပြုနေသော Helper Routes:\n" + routes.map((route) => "• " + route.animeTitle + " → " + route.targetChannelId).join("\n")
      : "Route မရှိသေးပါ။ /addroute Anime Name | -100...");
  });

  bot.command("removeroute", async (ctx) => {
    if (!(await requireAdmin(ctx, admins))) return;
    const title = (ctx.match ?? "").trim();
    const routeKey = normalizeRouteKey(title);
    if (!routeKey) {
      await ctx.reply("အသုံးပြုပုံ: /removeroute Anime Name");
      return;
    }
    const route = await db.collection<any>("helper_routes").findOne({ _id: routeKey, enabled: true });
    if (!route) {
      await ctx.reply("ဒီ Anime Route ကို မတွေ့ပါ။");
      return;
    }
    const now = new Date();
    await db.collection<any>("helper_routes").updateOne(
      { _id: routeKey },
      { $set: { enabled: false, updatedAt: now } }
    );
    await db.collection<Document>("anime_channels").updateOne(
      { telegramChannelId: route.targetChannelId },
      { $set: { enabled: false, updatedAt: now } }
    );
    await ctx.reply("Route ကို ပိတ်ပြီးပါပြီ။ သိမ်းထားသော Episode/Media record များကို မဖျက်ထားပါ။");
  });

  bot.command("helperreviews", async (ctx) => {
    if (!(await requireAdmin(ctx, admins))) return;
    const reviews = await db.collection<Document>("helper_review_items")
      .find({ status: "pending" })
      .sort({ updatedAt: -1 })
      .limit(10)
      .toArray();
    if (!reviews.length) {
      await ctx.reply("Pending Helper Review မရှိပါ။");
      return;
    }
    const lines = reviews.map((item, index) => {
      const title = String(item.normalizedTitle ?? item.caption ?? "(caption မရှိ)")
        .replace(/\s+/g, " ")
        .slice(0, 120);
      return String(index + 1) + ". " + title +
        "\nReason: " + String(item.reason ?? "unknown") +
        "\nHelper ID: " + String(item.userId ?? "unknown") +
        "\nMessage ID: " + String(item.sourceMessageId ?? "unknown");
    });
    await ctx.reply("Pending Helper Review (နောက်ဆုံး " + String(reviews.length) + " ခု)\n\n" + lines.join("\n\n"));
  });

  bot.command("helperguide", async (ctx) => {
    await ctx.reply(
      "Helper Video ပို့နည်း:\n" +
      "1. Helper အဖြစ် Admin မှ မှတ်ပုံတင်ထားရပါမည်။\n" +
      "2. Bot ကို Private Chat ဖွင့်ပြီး Video ကို Caption ပါအောင် ပို့ပါ။\n" +
      "3. Caption မှာ Anime Name၊ Episode Number နဲ့ Resolution ပါရပါမည်။\n\n" +
      "ဥပမာ:\nTales Of Herding God (104) 1080P\n\n" +
      "Bot က သက်ဆိုင်ရာ Private Channel သို့ Copy လုပ်ပြီး Episode/Resolution ကို DB ထဲ သိမ်းပါမည်။"
    );
  });

  bot.on(["message:video", "message:document"], async (ctx) => {
    if (ctx.chat.type !== "private" || !ctx.from) return;
    const message = ctx.message;
    let mediaType: "video" | "document";
    if ("video" in message && message.video) {
      mediaType = "video";
    } else if ("document" in message && message.document) {
      if (!message.document.mime_type?.startsWith("video/")) {
        await ctx.reply("Video file သာ လက်ခံပါသည်။ Document အတွက် video MIME type လိုအပ်ပါသည်။");
        return;
      }
      mediaType = "document";
    } else {
      return;
    }

    const forwardOrigin = message.forward_origin;
    if (forwardOrigin?.type === "channel") {
      const sessionIdentity = await db.collection<any>("system_settings").findOne({ _id: "telegram_user_session" });
      if (sessionIdentity && String(sessionIdentity.userId) === String(ctx.from.id)) {
        try {
          const hasVideo = "video" in message && Boolean(message.video);
          const hasDocument = "document" in message && Boolean(message.document);
          const result = await processAutoForwardMedia({
            api: ctx.api,
            db,
            userId: ctx.from.id,
            sourceChatId: ctx.chat.id,
            botMessageId: message.message_id,
            sourceChannelId: String(forwardOrigin.chat.id),
            originalMessageId: forwardOrigin.message_id,
            caption: message.caption ?? "",
            mediaType,
            videoWidth: hasVideo && "video" in message ? message.video?.width : undefined,
            videoHeight: hasVideo && "video" in message ? message.video?.height : undefined,
            mediaFileName: hasDocument && "document" in message ? message.document?.file_name : undefined
          });
          if (result.status === "route_not_found") {
            await ctx.reply("ဒီ Source Channel အတွက် Auto-forward Route မရှိပါ။ Admin က /startfw SOURCE_ID DEST_ID Anime Name ကို အသုံးပြုပါ။");
          } else if (result.status === "duplicate") {
            await ctx.reply("ဒီ Source post ကို အရင်က လုပ်ဆောင်ပြီးပါပြီ။");
          } else if (result.status === "review") {
            await ctx.reply("⚠️ Video ကို လက်ခံရရှိပါတယ်၊ ဒါပေမဲ့ Episode/Resolution ကို auto မခွဲနိုင်လို့ Review ထဲ သိမ်းထားပါတယ်။\nReason: " + result.reason);
          } else {
            await ctx.reply(
              "✅ Auto-forward ပြီးပါပြီ။\nAnime: " + result.animeTitle +
              "\nEpisode: " + String(result.episodeNumber) +
              "\nResolution: " + result.resolution +
              "\nDestination: " + result.targetChannelId
            );
          }
        } catch (error) {
          logger.error("Auto-forward media processing failed", {
            userId: ctx.from.id,
            sourceChannelId: String(forwardOrigin.chat.id),
            originalMessageId: forwardOrigin.message_id,
            error: error instanceof Error ? error.message : String(error)
          });
          await ctx.reply("Auto-forward မအောင်မြင်ပါ။ Caption၊ Bot permission နဲ့ log ကို စစ်ဆေးပါ။");
        }
        return;
      }
    }

    try {
      const result = await processHelperMedia({
        api: ctx.api,
        db,
        adminIds: admins,
        userId: ctx.from.id,
        sourceChatId: ctx.chat.id,
        sourceMessageId: message.message_id,
        caption: message.caption ?? "",
        mediaType
      });

      if (result.status === "unauthorized") {
        await ctx.reply("ဒီ Bot ရဲ့ Helper အဖြစ် မှတ်ပုံတင်ထားသူသာ Video ပို့နိုင်ပါသည်။ Admin ကို ဆက်သွယ်ပါ။");
      } else if (result.status === "duplicate") {
        await ctx.reply("ဒီ Video ကို အရင်က လုပ်ဆောင်ပြီး/လုပ်ဆောင်နေပါပြီ။");
      } else if (result.status === "review") {
        await ctx.reply(
          "Caption ကို သေချာမဖတ်နိုင်သေးပါ။ Review အတွက် သိမ်းထားပါပြီ။\n" +
          "Caption ဥပမာ: Anime Name (12) 1080P\n" +
          "Reason: " + result.reason
        );
      } else if (result.status === "route_not_found") {
        await ctx.reply(
          "ဒီ Anime အတွက် Private Channel Route မရှိသေးပါ။\nAnime: " + result.animeTitle +
          "\nAdmin က /addroute " + result.animeTitle + " | -1001234567890 ဖြင့် Route ထည့်ပေးပါ။"
        );
      } else {
        await ctx.reply(
          "✅ Media ကို Private Channel သို့ Copy လုပ်ပြီး သိမ်းဆည်းပြီးပါပြီ။\n" +
          "Anime: " + result.animeTitle + "\nEpisode: " + String(result.episodeNumber) +
          "\nResolution: " + result.resolution
        );
      }
    } catch (error) {
      logger.error("Helper media processing failed", {
        userId: ctx.from.id,
        sourceMessageId: message.message_id,
        error: error instanceof Error ? error.message : String(error)
      });
      await ctx.reply("Video ပို့/သိမ်းဆည်းမှု မအောင်မြင်ပါ။ Bot ရဲ့ Private Channel permission နဲ့ log ကို စစ်ဆေးပါ။");
    }
  });
}
