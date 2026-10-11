import type { ParseResult, SourceMessage } from "../shared/types.js";
import { normalizeMyanmarDigits, normalizePostText, stripLikelyPromotionalLines } from "./normalize.js";
import { parseResolution } from "./resolution-parser.js";

const episodePatterns = [
  /\(\s*(\d{1,5})\s*\)/i,
  /\b(?:episode|ep)\s*[#.:_-]?\s*(\d{1,5})\b/i,
  /အပိုင်း\s*[-:#]?\s*(\d{1,5})/i
];
const promoOnly = [/ကျွဲဂိမ်း|ရှမ်းကိုးမီး|ဘူကြီး|စလော့ဂိမ်း|ငါးပစ်ဂိမ်း/i,/မန်ဘာအသစ်ဘောနပ်စ်|နေ့စဉ်ငွေသွင်းဘောနပ်စ်/i];

function findEpisode(text:string):number|undefined {
 const normalized = normalizeMyanmarDigits(text);
 for(const pattern of episodePatterns){const match=normalized.match(pattern);if(match?.[1]){const value=Number(match[1]);if(Number.isSafeInteger(value)&&value>=1&&value<=100_000)return value;}}
 return undefined;
}
function extractName(text:string):string|undefined {
 const lines=text.split("\n").map(line=>line.trim()).filter(Boolean);
 for(const rawLine of lines){
  if((/^media\s*\+/i.test(rawLine)&&!findEpisode(rawLine)&&!parseResolution(rawLine))||/soulkingdom\.net|https?:\/\/|www\./i.test(rawLine)||promoOnly.some(pattern=>pattern.test(rawLine)))continue;
  const normalizedLine=normalizeMyanmarDigits(rawLine);
  const line=normalizedLine.replace(/^media\s*\+\s*/i,"").replace(/^anime\s*:\s*/i,"").replace(/\(\s*\d{1,5}\s*\)/g," ").replace(/\b(?:episode|ep)\s*[#.:_-]?\s*\d{1,5}\b/ig," ").replace(/အပိုင်း\s*[-:#]?\s*\d{1,5}/ig," ").replace(/\bSEC\s*0*\d+\b/ig," ").replace(/\b(?:240|360|480|540|720|1080)\s*P\b/ig," ").replace(/\b(?:2K|4K)\b/ig," ").replace(/\s+/g," ").replace(/^[|:+–—\-\s]+|[|:+–—\-\s]+$/g,"").trim();
  if(line.length>=2&&/[a-zA-Z\u1000-\u109F]/.test(line))return line;
 }
 return undefined;
}
export function parseEpisodeText(rawText:string):ParseResult {
 const normalizedTitle=normalizePostText(rawText); if(!normalizedTitle)return{status:"skip",reason:"empty_message"};
 const clean=stripLikelyPromotionalLines(normalizedTitle);
 if(!clean||promoOnly.some(pattern=>pattern.test(clean)&&!/episode|အပိုင်း|\(\s*\d+/.test(clean)))return{status:"skip",reason:"promotional_or_empty_after_filter"};
 const episodeNumber=findEpisode(clean);if(!episodeNumber)return{status:"review",reason:"episode_number_not_found",normalizedTitle};
 const englishName=extractName(clean);if(!englishName)return{status:"review",reason:"anime_title_not_found",normalizedTitle};
 const resolution=parseResolution(clean);
 return{status:"valid",value:{englishName,episodeNumber,...(resolution?{resolution}:{}),normalizedTitle}};
}
export function parseSourceMessage(message:SourceMessage):ParseResult {
 if(!message.hasMedia)return{status:"skip",reason:"no_media"};
 if(!["video","document"].includes(message.mediaType??""))return{status:"skip",reason:"unsupported_media_type"};
 return parseEpisodeText(message.text);
}
