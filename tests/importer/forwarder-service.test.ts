import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import type { AppConfig } from "../../src/config/env.js";
import type { TelegramClient } from "teleproto";

const mocks = vi.hoisted(() => ({
  createGramJsClient: vi.fn(),
  runAutoForwardWorker: vi.fn()
}));

vi.mock("../../src/importer/gramjs-client.js", () => ({
  createGramJsClient: mocks.createGramJsClient
}));
vi.mock("../../src/importer/forward-worker.js", () => ({
  runAutoForwardWorker: mocks.runAutoForwardWorker
}));

import { runAutoForwarderService } from "../../src/importer/forwarder-service.js";

describe("runAutoForwarderService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shares the connected bot's database, registers the session account, and stops cleanly", async () => {
    const controller = new AbortController();
    const client = {
      connect: vi.fn().mockResolvedValue(undefined),
      checkAuthorization: vi.fn().mockResolvedValue(true),
      getMe: vi.fn().mockResolvedValue({ id: 8251006975, username: "sessionuser" }),
      sendMessage: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined)
    } as unknown as TelegramClient;

    const settings = {
      findOne: vi.fn().mockResolvedValue(undefined),
      updateOne: vi.fn().mockResolvedValue({
        acknowledged: true,
        matchedCount: 1,
        modifiedCount: 1,
        upsertedCount: 0,
        upsertedId: null
      })
    };
    const db = {
      collection: vi.fn(() => settings)
    } as unknown as Db;
    const config = {
      TELEGRAM_API_ID: 123,
      TELEGRAM_API_HASH: "a".repeat(32),
      TELEGRAM_USER_SESSION: "mock-session",
      IMPORT_BATCH_SIZE: 50,
      AUTO_FORWARD_POLL_INTERVAL_SECONDS: 5
    } as unknown as AppConfig;

    mocks.createGramJsClient.mockReturnValue(client);
    mocks.runAutoForwardWorker.mockImplementation(async () => {
      controller.abort();
    });

    await runAutoForwarderService({
      config,
      db,
      botUsername: "SoulKingdomBot",
      signal: controller.signal
    });

    expect(client.connect).toHaveBeenCalledOnce();
    expect(client.checkAuthorization).toHaveBeenCalledOnce();
    expect(settings.updateOne).toHaveBeenCalledTimes(2);
    expect(client.sendMessage).toHaveBeenCalledWith("SoulKingdomBot", { message: "/start" });
    expect(mocks.runAutoForwardWorker).toHaveBeenCalledOnce();
    expect(client.disconnect).toHaveBeenCalledOnce();
  });
});
