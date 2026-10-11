import { loadConfig } from "../src/config/env.js";
import { connectDatabase, closeDatabase } from "../src/db/client.js";
import { ensureIndexes } from "../src/db/indexes.js";

try {
  const config = loadConfig();
  const db = await connectDatabase(config);
  await ensureIndexes(db);
  console.log("MongoDB indexes are ready.");
} catch (error) {
  console.error("Failed to create MongoDB indexes.", error);
  process.exitCode = 1;
} finally {
  await closeDatabase();
}