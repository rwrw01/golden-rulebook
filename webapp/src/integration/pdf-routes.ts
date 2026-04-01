import type { IncomingMessage, ServerResponse } from 'node:http';
import { getSession } from '../process/session-manager.ts';
import { extractMemo } from '../service/memo-extractor.ts';
import { generatePdf } from '../service/pdf-generator.ts';
import { logger } from '../lib/logger.ts';

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

export async function handlePdfRoutes(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  if (req.url !== '/api/v1/memo/pdf' || req.method !== 'POST') return false;

  try {
    const body = JSON.parse(await readBody(req)) as Record<string, unknown>;
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';

    const session = getSession(sessionId);
    if (!session) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Session not found' }));
      return true;
    }

    const memo = extractMemo(session.messages);
    if (!memo) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No memo found in session' }));
      return true;
    }

    const pdf = await generatePdf(memo);
    res.writeHead(200, {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="investment-memo.pdf"',
      'Content-Length': pdf.length.toString(),
    });
    res.end(pdf);
  } catch (error) {
    logger.error({ event: 'pdf_generation_failed', error: String(error) });
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'PDF generation failed' }));
  }

  return true;
}
