import { describe, expect, it } from "vitest";
import { classifyTeleprotoMedia } from "../../src/importer/media-classifier.js";

describe("classifyTeleprotoMedia", () => {
  it("returns undefined when no media is attached", () => {
    expect(classifyTeleprotoMedia(undefined)).toBeUndefined();
    expect(classifyTeleprotoMedia(null)).toBeUndefined();
  });

  it("recognizes video documents from MIME type", () => {
    expect(classifyTeleprotoMedia({
      className: "MessageMediaDocument",
      document: { mimeType: "video/mp4", attributes: [] }
    })).toBe("video");
  });

  it("recognizes video documents from a video attribute", () => {
    expect(classifyTeleprotoMedia({
      className: "MessageMediaDocument",
      document: { mimeType: "application/octet-stream", attributes: [{ className: "DocumentAttributeVideo" }] }
    })).toBe("video");
  });

  it("classifies other documents separately from videos", () => {
    expect(classifyTeleprotoMedia({
      className: "MessageMediaDocument",
      document: { mimeType: "application/zip", attributes: [] }
    })).toBe("document");
  });

  it("does not index photos as episodes", () => {
    expect(classifyTeleprotoMedia({ className: "MessageMediaPhoto" })).toBe("other");
  });
});