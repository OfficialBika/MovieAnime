import { describe, expect, it } from "vitest";
import { parseResolution } from "../../src/parser/resolution-parser.js";

describe("parseResolution", () => {
  it.each([
    ["Tales Of Herding God (104) 1080p", "1080P"],
    ["Tales Of Herding God (104) 1080 P", "1080P"],
    ["Episode 7 - 720P", "720P"],
    ["480p", "480P"],
    ["240 P", "240P"],
    ["4K UHD", "4K"],
    ["2K Remux", "2K"],
    ["no resolution", undefined],
    ["1080p60", undefined]
  ])("parses %s", (input, expected) => {
    expect(parseResolution(input)).toBe(expected);
  });
});