import { logger } from '../lib/logger.ts';

interface AssistantChunk {
  type: 'chunk';
  text: string;
}

interface AssistantEnd {
  type: 'message_end';
}

interface SessionEnd {
  type: 'session_end';
}

interface Unknown {
  type: 'unknown';
  raw: string;
}

export type ParsedEvent = AssistantChunk | AssistantEnd | SessionEnd | Unknown;

export function parseStreamLine(line: string): ParsedEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  try {
    const data = JSON.parse(trimmed) as Record<string, unknown>;

    if (data.type === 'assistant' && typeof data.message === 'string') {
      return { type: 'chunk', text: data.message };
    }

    if (data.type === 'content_block_delta') {
      const delta = data.delta as Record<string, unknown> | undefined;
      if (delta && typeof delta.text === 'string') {
        return { type: 'chunk', text: delta.text };
      }
    }

    if (data.type === 'message_stop' || data.type === 'result') {
      return { type: 'message_end' };
    }

    logger.debug({ event: 'unknown_stream_event', data });
    return { type: 'unknown', raw: trimmed };
  } catch {
    if (trimmed.length > 0) {
      return { type: 'chunk', text: trimmed };
    }
    return null;
  }
}
