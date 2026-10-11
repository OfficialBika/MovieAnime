import { Bot, GrammyError, HttpError } from "grammy";
import type { Context } from "grammy";
import { loadConfig, parseAdminIds } from "../config/env.js";
import { connectDatabase, closeDatabase } from "../db/client.js";
import { ensureIndexes } from "../db/indexes.js";
import { CatalogRepository } from "../db/repositories/catalog.js";
import { logger } from "../shared/logger.js";
import { animeKeyboard, episodeKeyboard, resolutionKeyboard } from "./keyboards/index.js";
import { registerChannelIndexer } from "./register-indexer.js";
import { registerHelperSystem } from "./register-helper.js";
import { deliverMedia } from "../services/media-delivery.js";
import type { Db } from "mongodb";
import type { MediaVersionDocument } from "../shared/types.js";

const config=loadConfig(),admins=parseAdminIds(config.ADMIN_USER_IDS);
const db=await connectDatabase(config);await ensureIndexes(db);
const catalog=new CatalogRepository(db);
const bot=new Bot(config.BOT_TOKEN,{client:{apiRoot:config.BOT_API_ROOT}});
registerChannelIndexer(bot,db);
registerHelperSystem(bot,db,admins);

bot.catch(({error,ctx})=>{
 if(error instanceof GrammyError)logger.error("Telegram API error",{method:error.method,error:error.description,updateId:ctx.update.update_id});
 else if(error instanceof HttpError)logger.error("Telegram network error",{error:error.message,updateId:ctx.update.update_id});
 else logger.error("Unhandled bot error",{error:error instanceof Error?error.message:String(error),updateId:ctx.update.update_id});
});

bot.command("start",async ctx=>{
 const args=(ctx.match??"").trim();
 if(args){
  if(!ctx.from||!admins.has(ctx.from.id)){await ctx.reply("Auto-forward Route သတ်မှတ်ရန် Admin သာ အသုံးပြုနိုင်ပါသည်။");return;}
  const parts=args.split(/\s+/);
  const sourceChannelId=parts[0]??"";
  const targetChannelId=parts[1]??"";
  if(parts.length!==2||!/^(-100[0-9]+)$/.test(sourceChannelId)||!/^(-100[0-9]+)$/.test(targetChannelId)){
   await ctx.reply("အသုံးပြုပုံ:\n/start SOURCE_CHANNEL_ID DESTINATION_PRIVATE_CHANNEL_ID\nဥပမာ: /start -1002484587849 -1004421847808");
   return;
  }
  try{
   const destination=await ctx.api.getChat(targetChannelId);
   if(destination.type!=="channel"){await ctx.reply("ဒုတိယ ID သည် Destination Channel ဖြစ်ရပါမည်။");return;}
   const botInfo=await ctx.api.getMe();
   const member=await ctx.api.getChatMember(targetChannelId,botInfo.id);
   if(member.status!=="creator"&&member.status!=="administrator"){
    await ctx.reply("Bot ကို ဒုတိယ Private Channel ထဲ Admin အဖြစ် ထည့်ပေးပါ။");return;
   }
   if(member.status==="administrator"&&!member.can_post_messages){
    await ctx.reply("Destination Channel ထဲမှာ Bot ရဲ့ Post Messages ခွင့်ကို ဖွင့်ပေးပါ။");return;
   }
   const now=new Date();
   await db.collection("auto_forward_routes").updateOne(
    {_id:sourceChannelId},
    {$set:{sourceChannelId,targetChannelId,enabled:true,updatedAt:now},
     $setOnInsert:{createdAt:now}},
    {upsert:true}
   );
   await ctx.reply(
    "✅ Auto-forward Route သိမ်းပြီးပါပြီ။\n\n"+
    "Source Channel: "+sourceChannelId+"\n"+
    "Destination Private Channel: "+targetChannelId+"\n\n"+
    "Session account က Source Channel ကို ဝင်ထားရပါမယ်။\n"+
    "PM2 မှာ movieanime-forwarder process ကိုပါ run ထားပါ။\n"+
    "Forwarder စောင့်ကြည့်ပြီးနောက် ရောက်လာမယ့် Video post အသစ်တွေကို Bot DM ကတစ်ဆင့် ပို့ပါမယ်။"
   );
  }catch(error){
   logger.warn("Auto-forward route setup failed",{sourceChannelId,targetChannelId,error:error instanceof Error?error.message:String(error)});
   await ctx.reply("Route မသတ်မှတ်နိုင်ပါ။ Destination ID၊ Bot Admin permission နဲ့ Channel ID ကို ပြန်စစ်ပါ။");
  }
  return;
 }
 const keyboard=[
  [{text:"ဇာတ်လမ်းများ",callback_data:"catalog"}],
  ...(config.MAIN_CHANNEL_URL?[[{text:"Main Channel",url:config.MAIN_CHANNEL_URL}]]:[])
 ];
 await ctx.reply("Anime ဇာတ်ကားပေါင်းစုံ ကြည့်ရန်\nကြည့်ရန် ဇာတ်လမ်းများကို အောက်ပါ Button မှ ရွေးချယ်ပါ။",{reply_markup:{inline_keyboard:keyboard}});
});
bot.callbackQuery("catalog",async ctx=>{
 const channels=await catalog.listEnabledChannels();await ctx.answerCallbackQuery();
 if(!channels.length){await ctx.editMessageText("ဇာတ်လမ်းများ မရှိသေးပါ။ Admin က Channel များကို မှတ်ပုံတင်ပေးရန် လိုအပ်ပါသည်။");return;}
 await ctx.editMessageText("ကြည့်ရှုလိုသော ဇာတ်လမ်းကို ရွေးချယ်ပါ။",{reply_markup:animeKeyboard(channels)});
});

async function showEpisodes(ctx:Context,animeId:string,page:number){
 const channel=await catalog.getChannel(animeId);
 if(!channel){await ctx.answerCallbackQuery({text:"ဇာတ်လမ်းကို ရှာမတွေ့ပါ။",show_alert:true});return;}
 const [episodes,latest]=await Promise.all([catalog.listEpisodes(channel._id,page*20,20),catalog.latestEpisode(channel._id)]);
 await ctx.answerCallbackQuery();
 await ctx.editMessageText(`${channel.title}\n\nအပိုင်းကို ရွေးချယ်ပါ။`,{reply_markup:episodeKeyboard(channel._id,episodes,page,latest)});
}
bot.callbackQuery(/^anime:([^:]+):(\d+)$/,async ctx=>{
 const animeId=ctx.match[1],page=Number(ctx.match[2]);
 if(!animeId||!Number.isSafeInteger(page)||page<0){await ctx.answerCallbackQuery({text:"ရွေးချယ်မှု မမှန်ကန်ပါ။",show_alert:true});return;}
 await showEpisodes(ctx,animeId,page);
});
bot.callbackQuery(/^page:([^:]+):(\d+)$/,async ctx=>{
 const animeId=ctx.match[1],page=Number(ctx.match[2]);
 if(!animeId||!Number.isSafeInteger(page)||page<0){await ctx.answerCallbackQuery({text:"စာမျက်နှာ မမှန်ကန်ပါ။",show_alert:true});return;}
 await showEpisodes(ctx,animeId,page);
});
bot.callbackQuery(/^ep:([^:]+):(\d+)$/,async ctx=>{
 const animeId=ctx.match[1],episode=Number(ctx.match[2]);
 if(!animeId||!Number.isSafeInteger(episode)||episode<1){await ctx.answerCallbackQuery({text:"အပိုင်းနံပါတ် မမှန်ကန်ပါ။",show_alert:true});return;}
 const channel=await catalog.getChannel(animeId);
 if(!channel){await ctx.answerCallbackQuery({text:"ဇာတ်လမ်းကို ရှာမတွေ့ပါ။",show_alert:true});return;}
 const media=await catalog.listResolutions(channel._id,episode);await ctx.answerCallbackQuery();
 if(!media.length){await ctx.reply(`${channel.title} — အပိုင်း ${episode}\nMedia မရှိသေးပါ။`);return;}
 await ctx.reply(`${channel.title} — အပိုင်း ${episode}\nResolution ရွေးချယ်ပါ။`,{reply_markup:resolutionKeyboard(channel._id,media)});
});
bot.callbackQuery(/^media:(.+)$/,async ctx=>{
 const mediaId=ctx.match[1];
 if(!mediaId||!ctx.from){await ctx.answerCallbackQuery({text:"Media ID မမှန်ကန်ပါ။",show_alert:true});return;}
 const media=await catalog.getMediaById(mediaId);
 if(!media||!media.available){await ctx.answerCallbackQuery({text:"ဒီ Media ကို ယခုရယူလို့ မရနိုင်ပါ။",show_alert:true});return;}
 await ctx.answerCallbackQuery({text:"Media ပို့နေပါသည်…"});
 try{
  await deliverMedia({
   api:ctx.api,db,userChatId:ctx.from.id,
   media:media as unknown as MediaVersionDocument,
   deleteDelaySeconds:config.DELETE_DELAY_SECONDS
  });
 }catch(error){
  logger.warn("Media delivery failed",{mediaId,userId:ctx.from.id,error:error instanceof Error?error.message:String(error)});
  await ctx.reply("Media ပို့မရပါ။ Channel Access၊ Content Protection နဲ့ Media Message ကို စစ်ဆေးပါ။");
 }
});

bot.command("health",async ctx=>{await ctx.reply("Bot process is online.");});
bot.command("addchannel",async ctx=>{
 if(!ctx.from||!admins.has(ctx.from.id)){await ctx.reply("ဤ Command ကို Admin သာ အသုံးပြုနိုင်ပါသည်။");return;}
 const raw=(ctx.match??"").trim();
 if(!/^-?\d{5,20}$/.test(raw)){await ctx.reply("အသုံးပြုပုံ: /addchannel -1001234567890\nBot ကို Channel ထဲ Admin ထည့်ပြီးမှ အသုံးပြုပါ။");return;}
 const channelId=raw;
 try{
  const chat=await ctx.api.getChat(channelId);
  if(chat.type!=="channel"){await ctx.reply("ပေးထားတဲ့ ID က Channel မဟုတ်ပါ။");return;}
  const now=new Date();
  await db.collection("anime_channels").updateOne(
   {telegramChannelId:channelId},
   {$set:{telegramChannelId:channelId,title:chat.title,enabled:true,updatedAt:now},$setOnInsert:{_id:channelId,createdAt:now,importStatus:"pending"}},
   {upsert:true}
  );
  await ctx.reply(`Channel မှတ်ပုံတင်ပြီးပါပြီ။\nအမည်: ${chat.title}\nID: ${channelId}\n\nHistory Import ကို သီးခြား Importer Service မှ စတင်နိုင်ပါပြီ။`);
 }catch(error){
  logger.warn("Channel registration failed",{channelId,error:error instanceof Error?error.message:String(error)});
  await ctx.reply("Channel ကို မရယူနိုင်ပါ။ Bot ကို Channel Admin ထည့်ထားခြင်းနဲ့ Channel ID ကို ပြန်စစ်ပါ။");
 }
});
bot.command("channels",async ctx=>{
 if(!ctx.from||!admins.has(ctx.from.id)){await ctx.reply("ဤ Command ကို Admin သာ အသုံးပြုနိုင်ပါသည်။");return;}
 const channels=await catalog.listEnabledChannels();
 await ctx.reply(channels.length?channels.map(c=>`• ${c.title} — ${c.telegramChannelId}`).join("\n"):"Channel မရှိသေးပါ။");
});
bot.command("forwards",async ctx=>{
 if(!ctx.from||!admins.has(ctx.from.id)){await ctx.reply("ဤ Command ကို Admin သာ အသုံးပြုနိုင်ပါသည်။");return;}
 const routes=await db.collection("auto_forward_routes").find({enabled:true}).sort({sourceChannelId:1}).toArray();
 await ctx.reply(routes.length?("အသုံးပြုနေသော Auto-forward Routes:\n"+routes.map(r=>"• "+String(r.sourceChannelId)+" → "+String(r.targetChannelId)).join("\n")):"Auto-forward Route မရှိသေးပါ။");
});
bot.command("stopforward",async ctx=>{
 if(!ctx.from||!admins.has(ctx.from.id)){await ctx.reply("ဤ Command ကို Admin သာ အသုံးပြုနိုင်ပါသည်။");return;}
 const sourceChannelId=(ctx.match??"").trim();
 if(!/^(-100[0-9]+)$/.test(sourceChannelId)){await ctx.reply("အသုံးပြုပုံ: /stopforward -1002484587849");return;}
 const result=await db.collection("auto_forward_routes").updateOne(
  {_id:sourceChannelId,enabled:true},
  {$set:{enabled:false,updatedAt:new Date(),stoppedAt:new Date()}}
 );
 await ctx.reply(result.modifiedCount?"Auto-forward ပိတ်ပြီးပါပြီ။\nSource: "+sourceChannelId:"ဒီ Source အတွက် Active Route မတွေ့ပါ။");
});
bot.command("admin",async ctx=>{
 if(!ctx.from||!admins.has(ctx.from.id)){await ctx.reply("ဤ Command ကို Admin သာ အသုံးပြုနိုင်ပါသည်။");return;}
 await ctx.reply("Admin Commands:\n/start SOURCE_ID DEST_ID — Session auto-forward route ဖွင့်မယ်\n/forwards — Auto-forward Route စာရင်း\n/stopforward SOURCE_ID — Route ပိတ်မယ်\n/addchannel -100... — Source Channel မှတ်ပုံတင်မယ်\n/channels — Channel စာရင်းကြည့်မယ်\n/addhelper USER_ID — Helper ဖွင့်မယ်\n/helpers — Helper စာရင်း\n/removehelper USER_ID — Helper ပိတ်မယ်\n/addroute Anime Name | -100... — Private Channel ချိတ်မယ်\n/routes — Route စာရင်း\n/helperreviews — Caption မပြည့်စုံသောစာရင်း\n/removeroute Anime Name — Route ပိတ်မယ်\n\nHelper များက Video ကို Bot Private Chat သို့ Caption ပါအောင် ပို့ပါ။");
});

const shutdown=async(signal:string)=>{
 logger.info("Shutting down bot",{signal});bot.stop();await closeDatabase();process.exit(0);
};
process.once("SIGINT",()=>void shutdown("SIGINT"));process.once("SIGTERM",()=>void shutdown("SIGTERM"));
logger.info("Starting Anime bot",{nodeEnv:config.NODE_ENV});
await bot.start({allowed_updates:["message","callback_query","channel_post","edited_channel_post"],onStart:info=>logger.info("Bot polling started",{username:info.username})});