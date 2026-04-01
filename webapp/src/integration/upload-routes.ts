import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { logger } from '../lib/logger.ts';

const UPLOAD_DIR = resolve(import.meta.dirname, '..', '..', 'uploads');
const ALLOWED_EXT = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.xlsx', '.xls', '.csv', '.pptx', '.ppt', '.doc', '.docx', '.txt']);
const MAX_SIZE = 20 * 1024 * 1024; // 20MB

const uploadedFiles = new Map<string, { path: string; name: string; mime: string }>();

export function getUploadedFile(id: string): { path: string; name: string; mime: string } | undefined {
  return uploadedFiles.get(id);
}

export async function handleUploadRoutes(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  if (req.url !== '/api/v1/upload' || req.method !== 'POST') return false;

  try {
    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('multipart/form-data')) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Expected multipart/form-data' }));
      return true;
    }

    const boundary = contentType.split('boundary=')[1];
    if (!boundary) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing boundary' }));
      return true;
    }

    const body = await readBody(req, MAX_SIZE);
    if (!body) {
      res.writeHead(413, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'File too large (max 20MB)' }));
      return true;
    }

    const file = parseMultipart(body, boundary);
    if (!file) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Could not parse file from upload' }));
      return true;
    }

    const ext = extname(file.filename).toLowerCase();
    const safeName = file.filename.replace(/[^a-zA-Z0-9._-]/g, '_');

    if (!ALLOWED_EXT.has(ext)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `File type ${ext} not supported` }));
      return true;
    }

    await mkdir(UPLOAD_DIR, { recursive: true });
    const id = randomUUID();
    const filePath = resolve(UPLOAD_DIR, `${id}${ext}`);
    await writeFile(filePath, file.data);

    uploadedFiles.set(id, { path: filePath, name: safeName, mime: file.contentType });
    logger.info({ event: 'file_uploaded', id, name: safeName, size: file.data.length });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ id, name: safeName, size: file.data.length }));
  } catch (error) {
    logger.error({ event: 'upload_failed', error: String(error) });
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Upload failed' }));
  }

  return true;
}

function readBody(req: IncomingMessage, maxSize: number): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxSize) { req.destroy(); resolve(null); return; }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', () => resolve(null));
  });
}

interface ParsedFile {
  filename: string;
  contentType: string;
  data: Buffer;
}

function parseMultipart(body: Buffer, boundary: string): ParsedFile | null {
  const boundaryBuf = Buffer.from(`--${boundary}`);
  const bodyStr = body.toString('latin1');

  const parts = bodyStr.split(`--${boundary}`);
  for (const part of parts) {
    if (part.includes('filename="')) {
      const filenameMatch = part.match(/filename="([^"]+)"/);
      const ctMatch = part.match(/Content-Type:\s*(.+)\r?\n/i);
      const headerEnd = part.indexOf('\r\n\r\n');

      if (filenameMatch && headerEnd !== -1) {
        const dataStart = headerEnd + 4;
        let dataEnd = part.length;
        if (part.endsWith('\r\n')) dataEnd -= 2;
        else if (part.endsWith('\r\n--')) dataEnd -= 4;

        const dataStr = part.slice(dataStart, dataEnd);
        const data = Buffer.from(dataStr, 'latin1');

        return {
          filename: filenameMatch[1],
          contentType: ctMatch ? ctMatch[1].trim() : 'application/octet-stream',
          data,
        };
      }
    }
  }
  return null;
}
