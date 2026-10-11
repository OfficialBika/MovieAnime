import { InlineKeyboard } from "grammy";
import type { WithId } from "mongodb";
import type { AnimeChannelDocument, MediaVersionDocument } from "../../shared/types.js";

export function animeKeyboard(channels: WithId<AnimeChannelDocument>[]): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  for (const [index, channel] of channels.entries()) {
    keyboard.text(channel.title.slice(0, 60), `anime:${channel._id}:0`);
    if (index % 2 === 1) keyboard.row();
  }
  if (channels.length % 2 === 1) keyboard.row();
  return keyboard;
}

export function episodeKeyboard(animeId: string, episodes: number[], page: number, latest?: number): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  episodes.forEach((episode, index) => {
    keyboard.text(String(episode), `ep:${animeId}:${episode}`);
    if ((index + 1) % 5 === 0) keyboard.row();
  });
  if (episodes.length % 5 !== 0) keyboard.row();
  keyboard.text("Back", `page:${animeId}:${Math.max(0, page - 1)}`);
  keyboard.text("Next", `page:${animeId}:${page + 1}`);
  if (latest !== undefined) keyboard.row().text("နောက်ဆုံးအပိုင်း", `ep:${animeId}:${latest}`);
  keyboard.row().text("⬅️ ဇာတ်လမ်းများ", "catalog");
  return keyboard;
}

export function resolutionKeyboard(animeId: string, media: MediaVersionDocument[]): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  for (const [index, version] of media.entries()) {
    keyboard.text(version.resolution, `media:${version._id}`);
    if (index % 2 === 1) keyboard.row();
  }
  if (media.length % 2 === 1) keyboard.row();
  keyboard.row().text("⬅️ အပိုင်းများ", `page:${animeId}:0`);
  return keyboard;
}