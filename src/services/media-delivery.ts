import type { Api, RawApi } from "grammy";
import type { Db } from "mongodb";
import type { MediaVersionDocument } from "../shared/types.js";

export async function deliverMedia(input:{api:Api<RawApi>;db:Db;userChatId:number;media:MediaVersionDocument;deleteDelaySeconds:number}):Promise<{mediaMessageId:number;warningMessageId:number}> {
  const {api,db,userChatId,media,deleteDelaySeconds}=input;
  if(!Number.isInteger(deleteDelaySeconds)||deleteDelaySeconds<60||deleteDelaySeconds>3600)throw new Error("Delete delay must be between 60 and 3600 seconds.");
  const copied=await api.copyMessage(userChatId,Number(media.sourceChannelId),media.sourceMessageId);
  let warningId:number|undefined;
  try {
    const warning=await api.sendMessage(userChatId,"⏳ သတိပေးချက်\nနောက် 5 မိနစ်ပြည့်ပါက ယခု Media ကို အလိုအလျောက် ဖျက်ပါမည်။\n📌 မဖျက်မီ ယခု Media ကို Saved Messages ထဲတွင် ကိုယ်တိုင်သိမ်းဆည်းထားပါ။");
    warningId=warning.message_id;
    await db.collection("delivery_jobs").insertOne({chatId:String(userChatId),messageIds:warningId===undefined?[copied.message_id]:[copied.message_id,warningId],deleteAt:new Date(Date.now()+deleteDelaySeconds*1000),status:"pending",attempts:0,createdAt:new Date(),updatedAt:new Date()});
    if(warningId===undefined)throw new Error("Warning message ID missing; refusing unscheduled delivery.");
    return {mediaMessageId:copied.message_id,warningMessageId:warningId};
  } catch(error) {
    try {await api.deleteMessage(userChatId,copied.message_id);if(warningId!==undefined)await api.deleteMessage(userChatId,warningId);}
    catch(cleanupError){logger.error("Failed to roll back partially delivered media",{userChatId,originalError:error instanceof Error?error.message:String(error),cleanupError:cleanupError instanceof Error?cleanupError.message:String(cleanupError)});}
    throw error;
  }
}
import { logger } from "../shared/logger.js";