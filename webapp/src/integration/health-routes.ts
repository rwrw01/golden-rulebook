import type { IncomingMessage, ServerResponse } from 'node:http';
import { checkCli } from '../service/cli-check.ts';

export async function handleHealthRoutes(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  if (req.url === '/healthz' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'alive' }));
    return true;
  }

  if (req.url === '/readyz' && req.method === 'GET') {
    const cli = await checkCli();
    const ready = cli.installed && cli.authenticated;
    res.writeHead(ready ? 200 : 503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: ready ? 'ready' : 'not_ready', cli }));
    return true;
  }

  if (req.url === '/api/v1/status' && req.method === 'GET') {
    const cli = await checkCli();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(cli));
    return true;
  }

  return false;
}
