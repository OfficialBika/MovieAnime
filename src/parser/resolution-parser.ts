import type { Resolution } from "../shared/types.js";

export function parseResolution(text: string): Resolution | undefined {
  const normalized = text
    .normalize("NFKC")
    .toUpperCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/(\d{3,4})\s*P\b/g, "$1P");
  const patterns: ReadonlyArray<readonly [Resolution, RegExp]> = [
    ["4K", /(?:^|[^A-Z0-9])4K(?:$|[^A-Z0-9])/],
    ["2K", /(?:^|[^A-Z0-9])2K(?:$|[^A-Z0-9])/],
    ["1080P", /(?:^|[^A-Z0-9])1080P(?:$|[^A-Z0-9])/],
    ["720P", /(?:^|[^A-Z0-9])720P(?:$|[^A-Z0-9])/],
    ["540P", /(?:^|[^A-Z0-9])540P(?:$|[^A-Z0-9])/],
    ["480P", /(?:^|[^A-Z0-9])480P(?:$|[^A-Z0-9])/],
    ["360P", /(?:^|[^A-Z0-9])360P(?:$|[^A-Z0-9])/],
    ["240P", /(?:^|[^A-Z0-9])240P(?:$|[^A-Z0-9])/]
  ];
  for (const [resolution, pattern] of patterns) {
    if (pattern.test(normalized)) return resolution;
  }
  return undefined;
}

/**
 * Infer the conventional video resolution tier from Telegram's video dimensions.
 * The shorter side is used so landscape and portrait videos are handled consistently.
 * Returns undefined for dimensions that don't fit a supported tier rather than guessing.
 */
export function resolutionFromDimensions(width?: number, height?: number): Resolution | undefined {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width === undefined ||
    height === undefined ||
    width <= 0 ||
    height <= 0
  ) {
    return undefined;
  }

  const shortSide = Math.min(width, height);
  if (shortSide >= 1900) return "4K";
  if (shortSide >= 1250) return "2K";
  if (shortSide >= 950) return "1080P";
  if (shortSide >= 630) return "720P";
  if (shortSide >= 510) return "540P";
  if (shortSide >= 420) return "480P";
  if (shortSide >= 300) return "360P";
  if (shortSide >= 180) return "240P";
  return undefined;
}
