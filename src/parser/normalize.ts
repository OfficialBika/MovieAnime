export function normalizePostText(input: string): string {
  return input
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\r/g, "\n")
    .replace(/[\t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function normalizeResolutionToken(input: string): string {
  return input.toUpperCase().replace(/[\s._-]+/g, "");
}

export function stripLikelyPromotionalLines(input: string): string {
  const lines = normalizePostText(input).split("\n");
  const promotional = [
    /ကျွဲဂိမ်း|ရှမ်းကိုးမီး|ဘူကြီး|စလော့ဂိမ်း|ငါးပစ်ဂိမ်း/i,
    /မန်ဘာအသစ်ဘောနပ်စ်|ငွေသွင်းဘောနပ်စ်|ဆက်သွယ်မေးမြန်း/i,
    /https?:\/\/|www\./i,
    /soulkingdom\.net/i
  ];
  return lines.filter((line) => !promotional.some((pattern) => pattern.test(line))).join("\n").trim();
}