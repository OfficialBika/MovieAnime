import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config/env.js";

describe("environment configuration", () => {
  it("accepts the blank optional entries in .env.example", () => {
    const config = loadConfig({
      NODE_ENV: "test",
      BOT_TOKEN: "test-token",
      BOT_API_ROOT: "https://api.telegram.org",
      MONGODB_URI: "mongodb://mongodb:27017",
      MONGODB_DATABASE: "bika_anime",
      ADMIN_USER_IDS: "123456789",
      MAIN_CHANNEL_URL: "",
      TELEGRAM_API_ID: "",
      TELEGRAM_API_HASH: "",
      TELEGRAM_USER_SESSION: ""
    });

    expect(config.MAIN_CHANNEL_URL).toBeUndefined();
    expect(config.TELEGRAM_API_ID).toBeUndefined();
    expect(config.TELEGRAM_API_HASH).toBeUndefined();
    expect(config.TELEGRAM_USER_SESSION).toBeUndefined();
  });

  it("requires all MTProto importer values when any one is configured", () => {
    expect(() => loadConfig({
      NODE_ENV: "test",
      BOT_TOKEN: "test-token",
      TELEGRAM_API_ID: "123"
    })).toThrow(/TELEGRAM_API_ID, TELEGRAM_API_HASH and TELEGRAM_USER_SESSION together/);
  });
});
