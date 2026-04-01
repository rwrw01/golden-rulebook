import { randomUUID } from 'node:crypto';
import { logger } from '../lib/logger.ts';
import { env } from '../lib/env.ts';
import { type ClaudeBridge, spawnClaude } from './claude-bridge.ts';
import type { Mode } from '../lib/types.ts';

interface ManagedSession {
  id: string;
  bridge: ClaudeBridge;
  messages: string[];
  active: boolean;
}

const sessions = new Map<string, ManagedSession>();

export function createSession(mode: Mode, pitch: string): ManagedSession | null {
  if (sessions.size >= env.MAX_SESSIONS) {
    logger.warn({ event: 'max_sessions_reached', max: env.MAX_SESSIONS });
    return null;
  }

  const id = randomUUID();
  const bridge = spawnClaude(mode, pitch);

  const session: ManagedSession = { id, bridge, messages: [], active: true };
  sessions.set(id, session);

  bridge.onExit(() => {
    session.active = false;
  });

  logger.info({ event: 'session_created', sessionId: id });
  return session;
}

export function getSession(id: string): ManagedSession | undefined {
  return sessions.get(id);
}

export function removeSession(id: string): void {
  const session = sessions.get(id);
  if (!session) return;

  session.bridge.kill();
  session.active = false;
  sessions.delete(id);
  logger.info({ event: 'session_removed', sessionId: id });
}

export async function drainAll(timeoutMs: number): Promise<void> {
  const ids = [...sessions.keys()];
  logger.info({ event: 'draining_sessions', count: ids.length });

  for (const id of ids) {
    removeSession(id);
  }

  await new Promise((resolve) => setTimeout(resolve, Math.min(timeoutMs, 1000)));
}
