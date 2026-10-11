import type { Resolution } from "../shared/types.js";
import { normalizeResolutionToken } from "./normalize.js";

const RESOLUTION_PATTERNS: ReadonlyArray<readonly [Resolution, RegExp]> = [
  ["4K", /(?:^|[^A-Z0-9])4K(?:$|[^A-Z0-9])/],
  ["2K", /(?:^|[^A-Z0-9])2K(?:$|[^A-Z0-9])/],
  ["1080P", /(?:^|[^A-Z0-9])1080P(?:$|[^A-Z0-9])/],
  ["720P", /(?:^|[^A-Z0-9])720P(?:$|[^A-Z0-9])/],
  ["480P", /(?:^|[^A-Z0-9])480P(?:$|[^A-Z0-9])/],
  ["240P", /(?:^|[^A-Z0-9])240P(?:$|[^A-Z0-9])/]
];

export function parseResolution(text: string): Resolution | undefined {
  // Keep separators as spaces so "1080 P" becomes "1080P" without
  // accidentally interpreting arbitrary alphanumeric substrings as a resolution.
  const candidate = normalizeResolutionToken(text).replace(/[^A-Z0-9]/g, " ");
  const compact = candidate.replace(/\s+/g, " ");
  for (const [resolution, pattern] of RESOLUTION_PATTERNS) {
    if (pattern.test(compact)) return resolution;
  }
  const joined = compact.replace(/\b(\d{3,4})\s+P\b/g, "$1P");
  for (const [resolution, pattern] of RESOLUTION_PATTERNS) {
    if (pattern.test(joined)) return resolution;
  }
  return undefined;
}