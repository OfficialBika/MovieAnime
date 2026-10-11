import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  BOT_TOKEN: z.string().min(1, "BOT_TOKEN is required"),
  BOT_API_ROOT: z.string().url().default("https://api.telegram.org"),
  MONGODB_URI: z.string().min(1).default("mongodb://127.0.0.1:27017"),
  MONGODB_DATABASE: z.string().min(1).default("bika_anime"),
  ADMIN_USER_IDS: z.string().default(""),
  MAIN_CHANNEL_URL: z.preprocess(
    (value) => value === "" ? undefined : value,
    z.string().url().optional()
  ),
  TELEGRAM_API_ID: z.preprocess(
    (value) => value === "" ? undefined : value,
    z.coerce.number().int().positive().optional()
  ),
  TELEGRAM_API_HASH: z.preprocess(
    (value) => value === "" ? undefined : value,
    z.string().optional()
  ),
  TELEGRAM_USER_SESSION: z.preprocess(
    (value) => value === "" ? undefined : value,
    z.string().optional()
  ),
  IMPORT_BATCH_SIZE: z.coerce.number().int().min(1).max(1000).default(100),
  AUTO_FORWARD_POLL_INTERVAL_SECONDS: z.coerce.number().int().min(1).max(60).default(5),
  IMPORT_MAX_CONCURRENCY: z.coerce.number().int().min(1).max(2).default(1),
  DELETE_DELAY_SECONDS: z.coerce.number().int().min(60).max(3600).default(300),
  DELETE_WORKER_INTERVAL_SECONDS: z.coerce.number().int().min(1).max(30).default(2),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info")
}).superRefine((v, ctx) => {
  const gramJsValues = [v.TELEGRAM_API_ID, v.TELEGRAM_API_HASH, v.TELEGRAM_USER_SESSION];
  const provided = gramJsValues.filter((item) => item !== undefined).length;
  if (provided !== 0 && provided !== 3) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "GramJS import requires TELEGRAM_API_ID, TELEGRAM_API_HASH and TELEGRAM_USER_SESSION together",
      path: ["TELEGRAM_USER_SESSION"]
    });
  }
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  return envSchema.parse(source);
}

export function parseAdminIds(raw: string): Set<number> {
  return new Set(
    raw.split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const n = Number(part);
        if (!Number.isSafeInteger(n) || n <= 0) {
          throw new Error(`Invalid Telegram admin user ID: ${part}`);
        }
        return n;
      })
  );
}