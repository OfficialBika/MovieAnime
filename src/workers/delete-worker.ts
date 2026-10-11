import type { Api, RawApi } from "grammy";
import type { Db, WithId } from "mongodb";
import { logger } from "../shared/logger.js";

interface DeleteJob {
  _id: string;
  chatId: string;
  messageIds: number[];
  deleteAt: Date;
  status: "pending" | "processing" | "completed" | "retry";
  attempts: number;
  updatedAt: Date;
}

export async function processDueDeleteJobs(api: Api<RawApi>, db: Db, now = new Date()): Promise<number> {
  let processed = 0;
  const jobs = db.collection<DeleteJob>("delivery_jobs");

  // Atomic status transition prevents two workers from processing the same due job.
  for (;;) {
    const job = await jobs.findOneAndUpdate(
      { status: { $in: ["pending", "retry", "processing"] }, deleteAt: { $lte: now } },
      { $set: { status: "processing", updatedAt: now } },
      { sort: { deleteAt: 1 }, returnDocument: "after" }
    ) as WithId<DeleteJob> | null;
    if (!job) break;

    let failed = false;
    let lastError = "";
    for (const messageId of job.messageIds) {
      try {
        await api.deleteMessage(Number(job.chatId), messageId);
      } catch (error) {
        const description = error instanceof Error ? error.message : String(error);
        // "message to delete not found" means it is already gone; other errors need retry.
        if (!/message to delete not found|message_id_invalid/i.test(description)) {
          failed = true;
          lastError = description;
        }
      }
    }

    await jobs.updateOne(
      { _id: job._id, status: "processing" },
      {
        $set: {
          status: failed ? "retry" : "completed",
          updatedAt: new Date(),
          ...(failed ? { lastError } : {})
        },
        $inc: { attempts: 1 }
      }
    );
    processed += 1;
    if (failed) logger.warn("Delete job will retry", { jobId: job._id, attempts: job.attempts + 1, error: lastError });
  }
  return processed;
}

export async function runDeleteWorker(
  api: Api<RawApi>,
  db: Db,
  intervalSeconds: number,
  signal: AbortSignal
): Promise<void> {
  while (!signal.aborted) {
    try {
      await processDueDeleteJobs(api, db);
    } catch (error) {
      logger.error("Delete worker pass failed", { error: error instanceof Error ? error.message : String(error) });
    }
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(resolve, intervalSeconds * 1000);
      signal.addEventListener("abort", () => {
        clearTimeout(timeout);
        resolve();
      }, { once: true });
    });
  }
}