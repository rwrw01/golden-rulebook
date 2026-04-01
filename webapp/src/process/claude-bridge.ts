import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { env } from '../lib/env.ts';
import { logger } from '../lib/logger.ts';
import { type ParsedEvent, parseStreamLine } from '../service/stream-parser.ts';
import type { Mode } from '../lib/types.ts';

const PROJECT_ROOT = resolve(import.meta.dirname, '..', '..', '..');

export interface ClaudeBridge {
  send: (text: string) => void;
  kill: () => void;
  onEvent: (handler: (event: ParsedEvent) => void) => void;
  onExit: (handler: (code: number | null) => void) => void;
  pid: number | undefined;
}

export function spawnClaude(mode: Mode, pitch: string): ClaudeBridge {
  const skillPrompt = `/angel-investor-pitch-evaluator ${mode}\n\n${pitch}`;

  const child: ChildProcess = spawn(env.CLAUDE_PATH, [
    '--print',
    '--output-format', 'stream-json',
    '--verbose',
  ], {
    cwd: PROJECT_ROOT,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env },
  });

  logger.info({ event: 'claude_spawned', pid: child.pid, mode });

  child.stdin?.write(skillPrompt + '\n');

  const eventHandlers: Array<(event: ParsedEvent) => void> = [];
  const exitHandlers: Array<(code: number | null) => void> = [];

  const rl = createInterface({ input: child.stdout! });
  rl.on('line', (line) => {
    const event = parseStreamLine(line);
    if (event) {
      for (const handler of eventHandlers) handler(event);
    }
  });

  child.stderr?.on('data', (data: Buffer) => {
    logger.debug({ event: 'claude_stderr', text: data.toString() });
  });

  child.on('exit', (code) => {
    logger.info({ event: 'claude_exited', pid: child.pid, code });
    for (const handler of exitHandlers) handler(code);
  });

  return {
    send(text: string) {
      if (child.stdin?.writable) {
        child.stdin.write(text + '\n');
      }
    },
    kill() {
      if (!child.killed) {
        child.kill('SIGTERM');
        setTimeout(() => { if (!child.killed) child.kill('SIGKILL'); }, 5000);
      }
    },
    onEvent(handler) { eventHandlers.push(handler); },
    onExit(handler) { exitHandlers.push(handler); },
    pid: child.pid,
  };
}
