import { WebSocket, WebSocketServer } from 'ws';
import type { Server } from 'node:http';
import { logger } from '../lib/logger.ts';
import { ClientMessageSchema, type ServerMessage } from '../lib/types.ts';
import { createSession, getSession, removeSession } from '../process/session-manager.ts';

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

export function attachWebSocket(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    logger.info({ event: 'ws_connected' });
    let sessionId: string | null = null;

    ws.on('message', (raw) => {
      const parsed = ClientMessageSchema.safeParse(safeJsonParse(raw.toString()));
      if (!parsed.success) {
        send(ws, { type: 'error', message: 'Invalid message format' });
        return;
      }

      const msg = parsed.data;

      if (msg.type === 'start') {
        if (sessionId) {
          send(ws, { type: 'error', message: 'Session already active' });
          return;
        }
        handleStart(ws, msg.mode, msg.pitch, (id) => { sessionId = id; });
        return;
      }

      if (msg.type === 'message') {
        if (!sessionId) {
          send(ws, { type: 'error', message: 'No active session' });
          return;
        }
        handleMessage(sessionId, msg.text);
        return;
      }

      if (msg.type === 'end') {
        if (sessionId) {
          removeSession(sessionId);
          sessionId = null;
        }
        send(ws, { type: 'session_end', memoAvailable: true });
      }
    });

    ws.on('close', () => {
      if (sessionId) removeSession(sessionId);
      logger.info({ event: 'ws_disconnected' });
    });
  });

  return wss;
}

function handleStart(
  ws: WebSocket,
  mode: 'sparring' | 'coaching' | 'masterclass',
  pitch: string,
  setSessionId: (id: string) => void,
): void {
  send(ws, { type: 'status', status: 'spawning' });

  const session = createSession(mode, pitch);
  if (!session) {
    send(ws, { type: 'error', message: 'Max sessions reached, try again later' });
    return;
  }

  setSessionId(session.id);
  send(ws, { type: 'status', status: 'ready', detail: session.id });

  session.bridge.onEvent((event) => {
    if (event.type === 'chunk') {
      session.messages.push(event.text);
      send(ws, { type: 'chunk', text: event.text });
    }
    if (event.type === 'message_end') {
      send(ws, { type: 'message_end' });
    }
  });

  session.bridge.onExit(() => {
    send(ws, { type: 'session_end', memoAvailable: session.messages.length > 0 });
  });
}

function handleMessage(sessionId: string, text: string): void {
  const session = getSession(sessionId);
  if (session?.active) {
    session.bridge.send(text);
  }
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
