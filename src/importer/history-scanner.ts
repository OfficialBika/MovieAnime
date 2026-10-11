import { Api } from "telegram";
import type { TelegramClient } from "telegram";
import type { Db, Document } from "mongodb";
import { parseSourceMessage } from "../parser/episode-parser.js";
import { logger } from "../shared/logger.js";
interface ImportOptions { client:TelegramClient; db:Db; channelId:string; batchSize:number; signal?:AbortSignal; }
export async function scanChannelHistory({client,db,channelId,batchSize,signal}:ImportOptions):Promise<void>{
 const channels=db.collection<Document>("anime_channels"),jobs=db.collection<Document>("import_jobs");
 const episodes=db.collection<Document>("episodes"),media=db.collection<Document>("media_versions"),reviews=db.collection<Document>("review_items");
 const channel=await client.getEntity(channelId) as Api.Channel;
 const channelDoc=await channels.findOne({telegramChannelId:channelId,enabled:true});
 if(!channelDoc)throw new Error("Channel must be registered and enabled before import.");
 const jobId=channelId,now=new Date();
 const jobFilter:Document={_id:{$eq:jobId}};
 const current=await jobs.findOne(jobFilter);
 if(!current)await jobs.insertOne({_id:jobId,channelId,status:"running",scannedCount:0,indexedCount:0,skippedCount:0,errorCount:0,leaseUntil:new Date(Date.now()+60_000),updatedAt:now});
 else{
  const claim=await jobs.updateOne({...jobFilter,$or:[{status:{$in:["pending","paused","failed"]}},{leaseUntil:{$lt:now}}]},{$set:{status:"running",leaseUntil:new Date(Date.now()+60_000),updatedAt:now}});
  if(claim.modifiedCount!==1)throw new Error("Import job is already running elsewhere.");
 }
 const state=await jobs.findOne(jobFilter);let cursor=typeof state?.cursorMessageId==="number"?state.cursorMessageId:undefined;
 try{
  for(;;){
   if(signal?.aborted)throw new Error("Import aborted");
   const page=await client.getMessages(channel,{limit:batchSize,...(cursor!==undefined?{maxId:cursor}:{})});if(!page.length)break;
   for(const message of page){
    if(signal?.aborted)throw new Error("Import aborted");
    const hasMedia=Boolean(message.media);
    const parsed=parseSourceMessage({channelId,messageId:message.id,text:message.message??"",hasMedia,...(hasMedia?{mediaType:"other" as const}:{})});
    if(parsed.status==="valid"){
     const animeId=String(channelDoc._id),episodeId=`${animeId}:${parsed.value.episodeNumber}`;
     await episodes.updateOne({_id:{$eq:episodeId}},{$setOnInsert:{_id:episodeId,animeId,episodeNumber:parsed.value.episodeNumber,createdAt:new Date()},$set:{updatedAt:new Date()}},{upsert:true});
     await media.updateOne({sourceChannelId:channelId,sourceMessageId:message.id},{$set:{_id:`${channelId}:${message.id}`,episodeId,resolution:parsed.value.resolution??"UNKNOWN",sourceChannelId:channelId,sourceMessageId:message.id,mediaType:"other",available:true,indexedAt:new Date()}},{upsert:true});
     await jobs.updateOne(jobFilter,{$inc:{scannedCount:1,indexedCount:1}});
    }else if(parsed.status==="review"){
     await reviews.updateOne({sourceChannelId:channelId,sourceMessageId:message.id},{$set:{sourceChannelId:channelId,sourceMessageId:message.id,reason:parsed.reason,text:parsed.normalizedTitle,updatedAt:new Date()}},{upsert:true});
     await jobs.updateOne(jobFilter,{$inc:{scannedCount:1,errorCount:1}});
    }else await jobs.updateOne(jobFilter,{$inc:{scannedCount:1,skippedCount:1}});
   }
   const oldest=page[page.length-1];if(!oldest)break;cursor=oldest.id;
   await jobs.updateOne(jobFilter,{$set:{cursorMessageId:cursor,leaseUntil:new Date(Date.now()+60_000),updatedAt:new Date()}});
   await new Promise(resolve=>setTimeout(resolve,500));
  }
  await jobs.updateOne(jobFilter,{$set:{status:"completed",leaseUntil:new Date(0),updatedAt:new Date()}});
 }catch(error){await jobs.updateOne(jobFilter,{$set:{status:"paused",leaseUntil:new Date(0),updatedAt:new Date(),lastError:error instanceof Error?error.message:String(error)}});logger.error("History scan paused",{channelId,error:error instanceof Error?error.message:String(error)});throw error;}
}