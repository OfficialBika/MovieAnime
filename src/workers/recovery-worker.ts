import type { Db } from "mongodb";

/**
 * Jobs left in processing after a crash are safe to retry:
 * deleting a message that is already gone is treated as completed by delete-worker.
 */
export async function recoverStaleJobs(db: Db, staleBefore = new Date(Date.now() - 60_000)): Promise<void> {
  await db.collection("delivery_jobs").updateMany(
    { status: "processing", updatedAt: { $lt: staleBefore } },
    { $set: { status: "retry", updatedAt: new Date() } }
  );
  await db.collection("import_jobs").updateMany(
    { status: "running", leaseUntil: { $lt: new Date() } },
    { $set: { status: "paused", updatedAt: new Date(), lastError: "stale_worker_lease_recovered" } }
  );
}