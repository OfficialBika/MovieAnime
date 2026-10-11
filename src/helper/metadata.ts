import type { Resolution, ParseResult } from "../shared/types.js";
import { parseSourceMessage } from "../parser/episode-parser.js";

export type HelperMediaType = "video" | "document";
export type KnownResolution = Exclude<Resolution, "UNKNOWN">;

export interface HelperMediaMetadata {
  animeTitle: string;
  episodeNumber: number;
  resolution: KnownResolution;
}

export type HelperMetadataResult =
  | { status: "valid"; value: HelperMediaMetadata }
  | { status: "review"; reason: string; normalizedTitle: string };

export function normalizeRouteKey(title: string): string {
  return title
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function parseHelperMetadata(caption: string, mediaType: HelperMediaType): HelperMetadataResult {
  const parsed: ParseResult = parseSourceMessage({
    channelId: "helper-inbox",
    messageId: 1,
    text: caption,
    hasMedia: true,
    mediaType
  });

  if (parsed.status !== "valid") {
    return {
      status: "review",
      reason: parsed.reason,
      normalizedTitle: parsed.status === "skip" ? caption.trim() : parsed.normalizedTitle
    };
  }

  if (!parsed.value.resolution || parsed.value.resolution === "UNKNOWN") {
    return {
      status: "review",
      reason: "resolution_not_found",
      normalizedTitle: parsed.value.normalizedTitle
    };
  }

  return {
    status: "valid",
    value: {
      animeTitle: parsed.value.englishName ?? "",
      episodeNumber: parsed.value.episodeNumber,
      resolution: parsed.value.resolution
    }
  };
}

export function buildHelperCaption(metadata: HelperMediaMetadata): string {
  return [
    "Media +",
    "Anime: " + metadata.animeTitle,
    "Episode: " + String(metadata.episodeNumber),
    "Resolution: " + metadata.resolution
  ].join("\n");
}
