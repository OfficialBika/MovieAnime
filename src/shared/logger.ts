type Level = "debug" | "info" | "warn" | "error";
const priority: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const configured = (process.env.LOG_LEVEL as Level | undefined) ?? "info";

function write(level: Level, message: string, fields: Record<string, unknown> = {}): void {
  if (priority[level] < (priority[configured] ?? priority.info)) return;
  const safeFields = { ...fields };
  for (const key of Object.keys(safeFields)) {
    if (/token|session|api.?hash|password|secret/i.test(key)) safeFields[key] = "[REDACTED]";
  }
  const line = JSON.stringify({ time: new Date().toISOString(), level, message, ...safeFields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (message: string, fields?: Record<string, unknown>) => write("debug", message, fields),
  info: (message: string, fields?: Record<string, unknown>) => write("info", message, fields),
  warn: (message: string, fields?: Record<string, unknown>) => write("warn", message, fields),
  error: (message: string, fields?: Record<string, unknown>) => write("error", message, fields)
};