import { TelegramClient } from "teleproto";
import { StringSession } from "teleproto/sessions";
import type { AppConfig } from "../config/env.js";

export function createGramJsClient(config: AppConfig): TelegramClient {
  const session = config.TELEGRAM_USER_SESSION;
  if (!config.TELEGRAM_API_ID || !config.TELEGRAM_API_HASH || !session) {
    throw new Error("History import is disabled: configure TELEGRAM_API_ID, TELEGRAM_API_HASH and an authorized User Session.");
  }
  return new TelegramClient(
    new StringSession(session),
    config.TELEGRAM_API_ID,
    config.TELEGRAM_API_HASH,
    { connectionRetries: 5, requestRetries: 3, autoReconnect: true }
  );
}