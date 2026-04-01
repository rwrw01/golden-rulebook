import { env } from './env.ts';

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const;

type Level = keyof typeof LEVELS;

function shouldLog(level: Level): boolean {
  return LEVELS[level] >= LEVELS[env.LOG_LEVEL];
}

function write(level: Level, data: Record<string, unknown>): void {
  if (!shouldLog(level)) return;
  const entry = { timestamp: new Date().toISOString(), level, ...data };
  process.stdout.write(JSON.stringify(entry) + '\n');
}

export const logger = {
  debug: (data: Record<string, unknown>) => write('debug', data),
  info: (data: Record<string, unknown>) => write('info', data),
  warn: (data: Record<string, unknown>) => write('warn', data),
  error: (data: Record<string, unknown>) => write('error', data),
};
