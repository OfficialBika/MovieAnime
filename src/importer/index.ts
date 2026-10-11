import { loadConfig } from "../config/env.js";
import { connectDatabase, closeDatabase } from "../db/client.js";
import { ensureIndexes } from "../db/indexes.js";
import { logger } from "../shared/logger.js";
import { createGramJsClient } from "./gramjs-client.js";
import { scanChannelHistory } from "./history-scanner.js";

const config = loadConfig();
const channelId = process.argv[2];
if (!channelId) {
  console.error("Usage: npm run start:importer -- <registered-telegram-channel-id>");
  process.exit(2);
}

const abortController = new AbortController();
process.once("SIGINT", () => abortController.abort());
process.once("SIGTERM", () => abortController.abort());

let client: ReturnType<typeof createGramJsClient> | undefined;
try {
  const db = await connectDatabase(config);
  await ensureIndexes(db);
  client = createGramJsClient(config);
  await client.start({}); // Session must already be provisioned and authorized securely.
  logger.info("GramJS importer connected", { channelId });
  await scanChannelHistory({
    client,
    db,
    channelId,
    batchSize: config.IMPORT_BATCH_SIZE,
    signal: abortController.signal
  });
  logger.info("Historical import completed", { channelId });
} catch (error) {
  logger.error("Historical import failed", { channelId, error: error instanceof Error ? error.message : String(error) });
  process.exitCode = 1;
} finally {
  if (client) await client.disconnect();
  await closeDatabase();
}