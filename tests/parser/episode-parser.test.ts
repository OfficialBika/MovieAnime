import { describe, expect, it } from "vitest";
import { parseEpisodeText, parseSourceMessage } from "../../src/parser/episode-parser.js";

describe("parseEpisodeText", () => {
  it("extracts episode number, anime name, and resolution while ignoring promo lines", () => {
    const result = parseEpisodeText(`Media + နွားကျောင်းသားလေးရဲ့ နတ်ဘုရားမှတ်တမ်း
Tales Of Herding God (104) 1080p
soulkingdom.net

🥹😞😙😎😅☺️😆🙃🤓

ကျွဲဂိမ်းစစ်စစ် ကြာခံအေ့ဂျင့်မလို
နေ့စဉ်ငွေသွင်းဘောနပ်စ်`);
    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      expect(result.value.episodeNumber).toBe(104);
      expect(result.value.resolution).toBe("1080P");
      expect(result.value.englishName).toContain("Tales Of Herding God");
    }
  });

  it("supports Burmese episode labels and Arabic digits", () => {
    const result = parseEpisodeText("Renegade Immortal\nအပိုင်း - 103\n720P");
    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      expect(result.value.episodeNumber).toBe(103);
      expect(result.value.resolution).toBe("720P");
    }
  });

  it("normalizes an attached Myanmar numeral such as အပိုင်း၁ to episode 1", () => {
    const result = parseEpisodeText("နွားကျောင်းသားလေးရဲ့ နတ်ဘုရားမှတ်တမ်း\nTales Of Herding God\nအပိုင်း၁\nSEC005");
    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      expect(result.value.episodeNumber).toBe(1);
    }
  });

  it("marks media with no episode as review", () => {
    expect(parseEpisodeText("Tales Of Herding God 1080P").status).toBe("review");
  });

  it("skips obvious gaming promotions", () => {
    expect(parseEpisodeText("ကျွဲဂိမ်းစစ်စစ် ကြာခံအေ့ဂျင့်မလို\nနေ့စဉ်ငွေသွင်းဘောနပ်စ်").status).toBe("skip");
  });

  it("skips a message without media", () => {
    const result = parseSourceMessage({
      channelId: "-100123",
      messageId: 1,
      text: "Tales Of Herding God (104) 1080p",
      hasMedia: false
    });
    expect(result).toEqual({ status: "skip", reason: "no_media" });
  });
});
