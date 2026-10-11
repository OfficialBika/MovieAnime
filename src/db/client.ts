import { MongoClient, type Db } from "mongodb";
import type { AppConfig } from "../config/env.js";

let client: MongoClient | undefined;
let database: Db | undefined;

export async function connectDatabase(config: AppConfig): Promise<Db> {
  if (database) return database;
  client = new MongoClient(config.MONGODB_URI, {
    appName: "bika-movie-anime-bot",
    maxPoolSize: 30,
    minPoolSize: 2,
    serverSelectionTimeoutMS: 10_000,
    retryWrites: true
  });
  await client.connect();
  database = client.db(config.MONGODB_DATABASE);
  await database.command({ ping: 1 });
  return database;
}

export async function closeDatabase(): Promise<void> {
  if (client) await client.close();
  client = undefined;
  database = undefined;
}