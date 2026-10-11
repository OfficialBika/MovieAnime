import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import type { AppConfig } from "../config/env.js";

export function createGramJsClient(config: AppConfig): TelegramClient {
  if (!config.TELEGRAM_API_ID || !config.TELEGRAM_API_HASH || !config.TELEGRAM_USER_SESSION) {
    throw new Error("GramJS import is disabled: configure API_ID, API_HASH and a User Session.");
  }
  return new TelegramClient(
    new StringSession(config.TELEGRAM_USER_SESSION),
    config.TELEGRAM_API_ID,
    config.TELEGRAM_API_HASH,
    { connectionRetries: 5, requestRetries: 3, autoReconnect: true }
  );
}