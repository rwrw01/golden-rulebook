/**
 * BlueDolphin Inzicht — Web Server
 * Serves the SPA client + API endpoints
 */
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';

import { handleApiRequest } from './api.js';
import { handleChat } from './chat.js';
import { generateAppDiagram } from './diagram.js';

const PORT = parseInt(process.env['PORT'] ?? '3002', 10);
const DB_PATH = join(import.meta.dirname!, '..', '..', 'data', 'impact.db');
const DIST_DIR = join(import.meta.dirname!, '..', '..', 'dist');

function main(): void {
  const db = new Database(DB_PATH);
  console.log('Database geladen: ' + DB_PATH);

  // Pre-load static files
  const indexHtml = readFileSync(join(DIST_DIR, 'index.html'), 'utf-8');
  const styleCss = readFileSync(join(DIST_DIR, 'style.css'), 'utf-8');
  let clientJs: string;
  try {
    clientJs = readFileSync(join(DIST_DIR, 'client.js'), 'utf-8');
  } catch {
    clientJs = 'console.error("Client bundle not built. Run: node build.mjs");';
  }
  let clientMap: string;
  try {
    clientMap = readFileSync(join(DIST_DIR, 'client.js.map'), 'utf-8');
  } catch {
    clientMap = '{}';
  }

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');

    // Chat endpoint (POST, streaming)
    if (url.pathname === '/api/chat' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
      req.on('end', () => { handleChat(body, db, res).catch(err => { res.writeHead(500); res.end(String(err)); }); });
      return;
    }

    // SVG diagram endpoint
    if (url.pathname.startsWith('/api/diagram/')) {
      const appId = url.pathname.slice('/api/diagram/'.length);
      const svg = generateAppDiagram(db, appId);
      res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-cache' });
      res.end(svg);
      return;
    }

    // API routes
    if (url.pathname.startsWith('/api/')) {
      handleApiRequest(url, db, res, req);
      return;
    }

    // Static assets
    if (url.pathname === '/style.css') {
      res.writeHead(200, { 'Content-Type': 'text/css', 'Cache-Control': 'no-cache' });
      res.end(styleCss);
      return;
    }
    if (url.pathname === '/client.js') {
      res.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-cache' });
      res.end(clientJs);
      return;
    }
    if (url.pathname === '/client.js.map') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(clientMap);
      return;
    }

    // SPA fallback — serve index.html for all routes
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(indexHtml);
  });

  server.listen(PORT, () => {
    console.log('BlueDolphin Inzicht: http://localhost:' + PORT);
  });

  process.on('SIGTERM', () => { db.close(); server.close(); process.exit(0); });
  process.on('SIGINT', () => { db.close(); server.close(); process.exit(0); });
}

main();
