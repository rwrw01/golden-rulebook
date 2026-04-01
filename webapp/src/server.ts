import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { env } from './lib/env.ts';
import { logger } from './lib/logger.ts';
import { handleHealthRoutes } from './integration/health-routes.ts';
import { handlePdfRoutes } from './integration/pdf-routes.ts';
import { handleUploadRoutes } from './integration/upload-routes.ts';
import { attachWebSocket } from './integration/ws-handler.ts';
import { drainAll } from './process/session-manager.ts';

const UI_DIR = resolve(import.meta.dirname, 'ui');

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
};

async function serveStatic(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = req.url === '/' ? '/index.html' : req.url;
  if (!url) return false;

  const filePath = resolve(UI_DIR, url.slice(1));
  if (!filePath.startsWith(UI_DIR)) {
    res.writeHead(403);
    res.end();
    return true;
  }

  try {
    const content = await readFile(filePath);
    const mime = MIME_TYPES[extname(filePath)] ?? 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(content);
    return true;
  } catch {
    return false;
  }
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (await handleHealthRoutes(req, res)) return;
  if (await handlePdfRoutes(req, res)) return;
  if (await handleUploadRoutes(req, res)) return;
  if (await serveStatic(req, res)) return;

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
}

const server = createServer((req, res) => {
  handleRequest(req, res).catch((error) => {
    logger.error({ event: 'request_error', error: String(error) });
    res.writeHead(500);
    res.end();
  });
});

attachWebSocket(server);

server.listen(env.PORT, () => {
  logger.info({ event: 'server_started', port: env.PORT });
  console.log(`\n  Angel Investor Pitch Evaluator`);
  console.log(`  http://localhost:${env.PORT}\n`);
});

process.on('SIGTERM', async () => {
  logger.info({ event: 'shutdown_initiated' });
  server.close();
  await drainAll(30_000);
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info({ event: 'shutdown_initiated' });
  server.close();
  await drainAll(5_000);
  process.exit(0);
});
