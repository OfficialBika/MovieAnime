import type { Resolution } from "../shared/types.js";

export function parseResolution(text: string): Resolution | undefined {
  const normalized = text
    .normalize("NFKC")
    .toUpperCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/(\d{3,4})\s*P\b/g, "$1P");
  const patterns: ReadonlyArray<readonly [Resolution, RegExp]> = [
    ["1080P", /(?:^|[^A-Z0-9])1080P(?:$|[^A-Z0-9])/],
    ["720P", /(?:^|[^A-Z0-9])720P(?:$|[^A-Z0-9])/],
    ["480P", /(?:^|[^A-Z0-9])480P(?:$|[^A-Z0-9])/],
    ["240P", /(?:^|[^A-Z0-9])240P(?:$|[^A-Z0-9])/],
    ["4K", /(?:^|[^A-Z0-9])4K(?:$|[^A-Z0-9])/],
    ["2K", /(?:^|[^A-Z0-9])2K(?:$|[^A-Z0-9])/]
  ];
  for (const [resolution, pattern] of patterns) {
    if (pattern.test(normalized)) return resolution;
  }
  return undefined;
}