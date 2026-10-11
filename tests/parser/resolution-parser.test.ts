import { describe, expect, it } from "vitest";
import { parseResolution, resolutionFromDimensions } from "../../src/parser/resolution-parser.js";

describe("parseResolution", () => {
  it.each([
    ["Tales Of Herding God (104) 1080p", "1080P"],
    ["Tales Of Herding God (104) 1080 P", "1080P"],
    ["Episode 7 - 720P", "720P"],
    ["540p", "540P"],
    ["480p", "480P"],
    ["360 P", "360P"],
    ["240 P", "240P"],
    ["4K UHD", "4K"],
    ["2K Remux", "2K"],
    ["no resolution", undefined],
    ["1080p60", undefined]
  ])("parses %s", (input, expected) => {
    expect(parseResolution(input)).toBe(expected);
  });
});

describe("resolutionFromDimensions", () => {
  it.each([
    [3840, 2160, "4K"],
    [2560, 1440, "2K"],
    [1920, 1080, "1080P"],
    [1280, 720, "720P"],
    [960, 540, "540P"],
    [854, 480, "480P"],
    [640, 360, "360P"],
    [426, 240, "240P"],
    [1080, 1920, "1080P"],
    [0, 0, undefined],
    [undefined, undefined, undefined]
  ] as const)("infers %s × %s as %s", (width, height, expected) => {
    expect(resolutionFromDimensions(width, height)).toBe(expected);
  });
});
