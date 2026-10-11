export type IndexedMediaType = "video" | "document" | "other";
type ObjectLike = Record<string, unknown>;

function asRecord(value: unknown): ObjectLike | undefined {
  return value !== null && typeof value === "object" ? value as ObjectLike : undefined;
}

/**
 * Classifies a Teleproto/GramJS Message.media value without downloading the file.
 * Photos and non-document media are deliberately excluded from episode indexing.
 */
export function classifyTeleprotoMedia(media: unknown): IndexedMediaType | undefined {
  const mediaRecord = asRecord(media);
  if (!mediaRecord) return undefined;

  const document = asRecord(mediaRecord.document);
  if (!document) return "other";

  const mimeType = typeof document.mimeType === "string" ? document.mimeType.toLowerCase() : "";
  const attributes = Array.isArray(document.attributes) ? document.attributes : [];
  const hasVideoAttribute = attributes.some((value) => {
    const attribute = asRecord(value);
    return typeof attribute?.className === "string"
      && attribute.className.toLowerCase().includes("documentattributevideo");
  });

  return mimeType.startsWith("video/") || hasVideoAttribute ? "video" : "document";
}