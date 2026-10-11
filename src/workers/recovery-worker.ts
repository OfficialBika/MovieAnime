import type { Db, Document } from "mongodb";

interface RecoveryJob extends Document {
  attempts?: number;
}

/**
 * Jobs left in processing after a crash are safe to retry:
 * deleting a message that is already gone is treated as completed by delete-worker.
 */
export async function recoverStaleJobs(db: Db, staleBefore = new Date(Date.now() - 60_000), maxAttempts = 12): Promise<void> {
  const jobs = db.collection<RecoveryJob>("delivery_jobs");
  const now = new Date();
  await jobs.updateMany(
    { status: "processing", updatedAt: { $lt: staleBefore }, attempts: { $gte: maxAttempts } },
    { $set: { status: "failed", updatedAt: now, lastError: "max_attempts_reached_after_worker_restart" } }
  );
  await jobs.updateMany(
    { status: "processing", updatedAt: { $lt: staleBefore }, attempts: { $lt: maxAttempts } },
    { $set: { status: "retry", updatedAt: now } }
  );
  await db.collection("import_jobs").updateMany(
    { status: "running", leaseUntil: { $lt: now } },
    { $set: { status: "paused", updatedAt: now, lastError: "stale_worker_lease_recovered" } }
  );
}