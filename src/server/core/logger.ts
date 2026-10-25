import { getSettings } from "./config";

const LEVELS = { DEBUG: 10, INFO: 20, WARNING: 30, ERROR: 40, CRITICAL: 50 } as const;
type LevelName = keyof typeof LEVELS;

function thresholdFor(name: string): number {
  const key = name.toUpperCase() as LevelName;
  return LEVELS[key] ?? LEVELS.INFO;
}

function formatError(err: unknown): string {
  if (err instanceof Error) {
    return err.stack ?? `${err.name}: ${err.message}`;
  }
  return String(err);
}

/** Structured console logger using the same line format as the Python service. */
export class Logger {
  constructor(private readonly name: string) {}

  private emit(level: LevelName, message: string, err?: unknown): void {
    if (LEVELS[level] < thresholdFor(getSettings().LOG_LEVEL)) return;
    const line = `${new Date().toISOString()} [${level}] ${this.name}: ${message}`;
    const text = err === undefined ? line : `${line}\n${formatError(err)}`;
    if (LEVELS[level] >= LEVELS.WARNING) {
      console.error(text);
    } else {
      console.log(text);
    }
  }

  debug(message: string): void {
    this.emit("DEBUG", message);
  }

  info(message: string): void {
    this.emit("INFO", message);
  }

  warn(message: string, err?: unknown): void {
    this.emit("WARNING", message, err);
  }

  error(message: string, err?: unknown): void {
    this.emit("ERROR", message, err);
  }
}

export function getLogger(name: string): Logger {
  return new Logger(name);
}
