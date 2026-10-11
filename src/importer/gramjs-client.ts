import { TelegramClient } from "teleproto";
import { StringSession } from "teleproto/sessions";
import type { AppConfig } from "../config/env.js";

export function createGramJsClient(config: AppConfig): TelegramClient {
  if (!config.TELEGRAM_API_ID || !config.TELEGRAM_API_HASH || !config.TELEGRAM_USER_SESSION) {
    throw new Error("History import is disabled: configure API_ID, API_HASH and an authorized User Session.");
  }
  return new TelegramClient(
    new StringSession(config.TELEGRAM_USER_SESSION),
    config.TELEGRAM_API_ID,
    config.TELEGRAM_API_HASH,
    { connectionRetries: 5, requestRetries: 3, autoReconnect: true }
  );
}