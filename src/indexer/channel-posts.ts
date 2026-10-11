import type { Context } from "grammy";
import type { Db, Document } from "mongodb";
import { parseSourceMessage } from "../parser/episode-parser.js";
import { logger } from "../shared/logger.js";
export async function indexChannelPost(ctx:Context,db:Db):Promise<void>{
 const post=ctx.channelPost??ctx.editedChannelPost;if(!post)return;
 const channelId=String(post.chat.id),messageId=post.message_id;
 const channels=db.collection<Document>("anime_channels"),episodes=db.collection<Document>("episodes"),media=db.collection<Document>("media_versions"),reviews=db.collection<Document>("review_items");
 const registered=await channels.findOne({telegramChannelId:channelId,enabled:true});if(!registered)return;
 const mediaType=post.video?"video":post.document?"document":undefined;
 const caption="caption" in post?post.caption:undefined,text=caption??("text" in post?post.text:"")??"";
 const parsed=parseSourceMessage({channelId,messageId,text,hasMedia:Boolean(post.video||post.document),...(mediaType?{mediaType}:{}),date:new Date(post.date*1000)});
 if(parsed.status==="skip"){logger.debug("Channel post skipped",{channelId,messageId,reason:parsed.reason});return;}
 if(parsed.status==="review"){await reviews.updateOne({sourceChannelId:channelId,sourceMessageId:messageId},{$set:{sourceChannelId:channelId,sourceMessageId:messageId,reason:parsed.reason,text:parsed.normalizedTitle,updatedAt:new Date()}},{upsert:true});return;}
 const animeId=String(registered._id),episodeId=`${animeId}:${parsed.value.episodeNumber}`;
 await episodes.updateOne({_id:{$eq:episodeId}},{$setOnInsert:{_id:episodeId,animeId,episodeNumber:parsed.value.episodeNumber,createdAt:new Date()},$set:{updatedAt:new Date()}},{upsert:true});
 await media.updateOne({sourceChannelId:channelId,sourceMessageId:messageId},{$set:{_id:`${channelId}:${messageId}`,episodeId,resolution:parsed.value.resolution??"UNKNOWN",sourceChannelId:channelId,sourceMessageId:messageId,mediaType:mediaType??"other",available:true,indexedAt:new Date()}},{upsert:true});
}