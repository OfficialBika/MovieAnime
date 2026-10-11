import { describe, expect, it } from "vitest";
import {
  buildHelperCaption,
  normalizeRouteKey,
  parseHelperMetadata
} from "../../src/helper/metadata.js";

describe("helper metadata", () => {
  it("parses an Anime + Episode + Resolution caption", () => {
    const result = parseHelperMetadata("Tales Of Herding God (104) 1080p", "video");
    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      expect(result.value).toEqual({
        animeTitle: "Tales Of Herding God",
        episodeNumber: 104,
        resolution: "1080P"
      });
    }
  });

  it("accepts a Media + prefix on the first caption line", () => {
    const result = parseHelperMetadata("Media + Tales Of Herding God (104) 1080P", "video");
    expect(result.status).toBe("valid");
    if (result.status === "valid") expect(result.value.animeTitle).toBe("Tales Of Herding God");
  });

  it("sends missing resolution to review instead of guessing", () => {
    const result = parseHelperMetadata("Tales Of Herding God (104)", "video");
    expect(result.status).toBe("review");
    if (result.status === "review") expect(result.reason).toBe("resolution_not_found");
  });

  it("normalizes route names consistently", () => {
    expect(normalizeRouteKey(" Tales   Of-Herding God! ")).toBe("tales of herding god");
  });

  it("builds a channel caption with all required metadata", () => {
    expect(buildHelperCaption({
      animeTitle: "Tales Of Herding God",
      episodeNumber: 104,
      resolution: "1080P"
    })).toBe("Media +\nAnime: Tales Of Herding God\nEpisode: 104\nResolution: 1080P");
  });
});
