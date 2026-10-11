import type { Api, RawApi } from "grammy";
import type { Db } from "mongodb";
import { logger } from "../shared/logger.js";
interface DeleteJob { _id:string; chatId:string; messageIds:number[]; deleteAt:Date; status:"pending"|"processing"|"completed"|"retry"|"failed"; attempts:number; updatedAt:Date; }
export async function processDueDeleteJobs(api:Api<RawApi>,db:Db,now=new Date(),maxAttempts=12):Promise<number>{
 let processed=0; const jobs=db.collection<DeleteJob>("delivery_jobs");
 for(;;){
  const job=await jobs.findOneAndUpdate({status:{$in:["pending","retry"]},deleteAt:{$lte:now},attempts:{$lt:maxAttempts}},{$set:{status:"processing",updatedAt:now}},{sort:{deleteAt:1},returnDocument:"after"});
  if(!job) break; let failed=false; let lastError="";
  for(const messageId of job.messageIds){try{await api.deleteMessage(Number(job.chatId),messageId);}catch(error){const d=error instanceof Error?error.message:String(error);if(!/message to delete not found|message_id_invalid/i.test(d)){failed=true;lastError=d;}}}
  const attempts=job.attempts+1; const terminal=failed&&attempts>=maxAttempts; const retryAt=new Date(Date.now()+Math.min(60_000,1_000*(2**Math.min(attempts,6))));
  await jobs.updateOne({_id:job._id,status:"processing"},{$set:{status:failed?(terminal?"failed":"retry"):"completed",deleteAt:failed&&!terminal?retryAt:job.deleteAt,updatedAt:new Date(),...(failed?{lastError}:{})},$inc:{attempts:1}});
  processed++; if(failed) logger.warn("Delete job attempt failed",{jobId:job._id,attempts,terminal,error:lastError});
 }
 await jobs.updateMany({status:"processing",updatedAt:{$lt:new Date(Date.now()-60_000)}},{$set:{status:"retry",updatedAt:new Date()}});
 return processed;
}
export async function runDeleteWorker(api:Api<RawApi>,db:Db,intervalSeconds:number,signal:AbortSignal):Promise<void>{
 while(!signal.aborted){try{await processDueDeleteJobs(api,db);}catch(error){logger.error("Delete worker pass failed",{error:error instanceof Error?error.message:String(error)});}
 await new Promise<void>(resolve=>{const timeout=setTimeout(resolve,intervalSeconds*1000);signal.addEventListener("abort",()=>{clearTimeout(timeout);resolve();},{once:true});});}
}