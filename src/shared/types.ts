export const RESOLUTIONS = ["240P", "480P", "720P", "1080P", "2K", "4K", "UNKNOWN"] as const;
export type Resolution = (typeof RESOLUTIONS)[number];

export interface ParsedEpisode {
  englishName?: string;
  episodeNumber: number;
  resolution?: Resolution;
  normalizedTitle: string;
}

export type ParseResult =
  | { status: "valid"; value: ParsedEpisode }
  | { status: "review"; reason: string; normalizedTitle: string }
  | { status: "skip"; reason: string };

export interface SourceMessage {
  channelId: string;
  messageId: number;
  text: string;
  hasMedia: boolean;
  mediaType?: "video" | "document" | "other";
  date?: Date;
}

export interface AnimeChannelDocument {
  _id: string;
  telegramChannelId: string;
  title: string;
  enabled: boolean;
  importStatus: "pending" | "running" | "paused" | "completed" | "failed";
  createdAt: Date;
  updatedAt: Date;
}

export interface EpisodeDocument {
  _id: string;
  animeId: string;
  episodeNumber: number;
  title?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface MediaVersionDocument {
  _id: string;
  episodeId: string;
  resolution: Resolution;
  sourceChannelId: string;
  sourceMessageId: number;
  mediaType: "video" | "document" | "other";
  available: boolean;
  indexedAt: Date;
}

export interface DeliveryJobDocument {
  _id: string;
  chatId: string;
  messageIds: number[];
  deleteAt: Date;
  status: "pending" | "processing" | "completed" | "retry";
  attempts: number;
  createdAt: Date;
  updatedAt: Date;
  lastError?: string;
}

export interface ImportJobDocument {
  _id: string;
  channelId: string;
  status: "pending" | "running" | "paused" | "completed" | "failed";
  cursorMessageId?: number;
  scannedCount: number;
  indexedCount: number;
  skippedCount: number;
  errorCount: number;
  leaseUntil?: Date;
  updatedAt: Date;
  lastError?: string;
}