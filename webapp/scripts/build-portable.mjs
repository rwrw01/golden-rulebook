import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = resolve(ROOT, 'dist', 'pitch-evaluator-portable');
const NODE_VERSION = '22.15.0';
const NODE_URL = `https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-win-x64.zip`;

console.log('=== Building portable distribution ===\n');

// Clean
rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });
mkdirSync(resolve(DIST, 'runtime'), { recursive: true });

// Bundle server into single JS file
console.log('1. Bundling application...');
await build({
  entryPoints: [resolve(ROOT, 'src', 'server.ts')],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  outfile: resolve(DIST, 'app.mjs'),
  minify: true,
  sourcemap: false,
  banner: { js: '// Angel Investor Pitch Evaluator — Portable Build' },
  external: [],
  define: {
    'import.meta.dirname': '__PORTABLE_DIRNAME__',
  },
});

// Patch import.meta.dirname for the bundle (esbuild can't resolve it in bundle)
let bundled = readFileSync(resolve(DIST, 'app.mjs'), 'utf-8');
bundled = bundled.replace(
  /__PORTABLE_DIRNAME__/g,
  'new URL(".", import.meta.url).pathname.slice(1).replace(/\\//g, "\\\\\\\\")',
);
// Inject a fix for the UI path to look next to the bundle
bundled = `import { fileURLToPath as __ftp } from "node:url"; import { dirname as __dn } from "node:path";\nvar __portable_dir = __dn(__ftp(import.meta.url));\n` + bundled;
writeFileSync(resolve(DIST, 'app.mjs'), bundled);

// Copy UI files
console.log('2. Copying UI files...');
mkdirSync(resolve(DIST, 'ui'), { recursive: true });
cpSync(resolve(ROOT, 'src', 'ui'), resolve(DIST, 'ui'), { recursive: true });

// Copy skill file
console.log('3. Copying skill...');
mkdirSync(resolve(DIST, 'skills', 'angel-investor-pitch-evaluator'), { recursive: true });
cpSync(
  resolve(ROOT, '..', 'skills', 'angel-investor-pitch-evaluator', 'skill.md'),
  resolve(DIST, 'skills', 'angel-investor-pitch-evaluator', 'skill.md'),
);

// Copy setup guide
cpSync(resolve(ROOT, 'SETUP-GUIDE.md'), resolve(DIST, 'SETUP-GUIDE.md'));

// Create launcher batch file
console.log('4. Creating launcher...');
writeFileSync(resolve(DIST, 'start.bat'), `@echo off
setlocal enabledelayedexpansion

title Angel Investor Pitch Evaluator
echo.
echo  ============================================
echo   Angel Investor Pitch Evaluator
echo  ============================================
echo.

:: Check for portable Node.js first
if exist "%~dp0runtime\\node.exe" (
    set "NODE=%~dp0runtime\\node.exe"
    goto :check_claude
)

:: Check system Node.js
where node >nul 2>&1
if %ERRORLEVEL% equ 0 (
    set "NODE=node"
    goto :check_claude
)

:: No Node.js found — download portable version
echo  Node.js not found. Downloading portable runtime...
echo  This is a one-time download (about 40 MB).
echo.
powershell -ExecutionPolicy Bypass -File "%~dp0download-node.ps1"
if exist "%~dp0runtime\\node.exe" (
    set "NODE=%~dp0runtime\\node.exe"
    goto :check_claude
)

echo.
echo  ERROR: Could not download Node.js automatically.
echo  Please download Node.js from https://nodejs.org
echo  and install it, then try again.
echo.
pause
exit /b 1

:check_claude
:: Check if Claude Code is available
where claude >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo  Claude Code not found. Installing...
    echo.
    call npm install -g @anthropic-ai/claude-code
    where claude >nul 2>&1
    if %ERRORLEVEL% neq 0 (
        echo.
        echo  ERROR: Could not install Claude Code.
        echo  Please run: npm install -g @anthropic-ai/claude-code
        echo.
        pause
        exit /b 1
    )
)

:: Check auth
claude auth status >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo  Claude Code is not logged in. Opening login...
    echo.
    claude auth login
)

:: Start the application
echo  Starting application...
echo.
set "PORT=8080"
"%NODE%" "%~dp0app.mjs"

pause
`, 'utf-8');

// Create PowerShell script to download portable Node.js
writeFileSync(resolve(DIST, 'download-node.ps1'), `# Download portable Node.js for Windows
$ErrorActionPreference = "Stop"
$nodeVersion = "${NODE_VERSION}"
$url = "${NODE_URL}"
$zipFile = "$PSScriptRoot\\runtime\\node.zip"
$extractDir = "$PSScriptRoot\\runtime"

Write-Host "  Downloading Node.js v$nodeVersion..."

New-Item -ItemType Directory -Force -Path $extractDir | Out-Null

# Download
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$wc = New-Object System.Net.WebClient
$wc.DownloadFile($url, $zipFile)

Write-Host "  Extracting..."

# Extract
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::ExtractToDirectory($zipFile, $extractDir)

# Move files from nested dir to runtime/
$nestedDir = Get-ChildItem -Path $extractDir -Directory | Where-Object { $_.Name -like "node-*" } | Select-Object -First 1
if ($nestedDir) {
    Get-ChildItem -Path $nestedDir.FullName | Move-Item -Destination $extractDir -Force
    Remove-Item -Path $nestedDir.FullName -Recurse -Force
}

# Cleanup zip
Remove-Item -Path $zipFile -Force

Write-Host "  Node.js v$nodeVersion installed to runtime folder."
Write-Host ""
`, 'utf-8');

// Create a wrapper that fixes the UI path for the portable build
console.log('5. Creating portable entry point...');
writeFileSync(resolve(DIST, 'app.mjs'), `
import { createServer } from 'node:http';
import { readFile, writeFile as writeFileFs, mkdir } from 'node:fs/promises';
import { resolve, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFile } from 'node:child_process';
import { createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import PDFDocument from 'pdfkit';
import { z } from 'zod';

const __dir = dirname(fileURLToPath(import.meta.url));
const UI_DIR = resolve(__dir, 'ui');
const UPLOAD_DIR = resolve(__dir, 'uploads');
const PORT = parseInt(process.env.PORT || '8080', 10);
const MAX_UPLOAD = 20 * 1024 * 1024;
const ALLOWED_EXT = new Set(['.pdf','.png','.jpg','.jpeg','.webp','.xlsx','.xls','.csv','.pptx','.ppt','.doc','.docx','.txt']);

// --- Logger ---
function log(level, data) {
  process.stdout.write(JSON.stringify({ timestamp: new Date().toISOString(), level, ...data }) + '\\n');
}

// --- CLI Check ---
function runCmd(cmd, args) {
  return new Promise((res) => {
    execFile(cmd, args, { timeout: 5000 }, (err, stdout) => {
      res(err ? null : stdout.trim());
    });
  });
}

async function checkCli() {
  const version = await runCmd('claude', ['--version']);
  if (!version) return { installed: false, version: null, authenticated: false };
  const auth = await runCmd('claude', ['auth', 'status']);
  return { installed: true, version, authenticated: !!auth && !auth.includes('not logged in') };
}

// --- Stream Parser ---
function parseStreamLine(line) {
  const t = line.trim();
  if (!t) return null;
  try {
    const d = JSON.parse(t);
    if (d.type === 'assistant' && typeof d.message === 'string') return { type: 'chunk', text: d.message };
    if (d.type === 'content_block_delta' && d.delta?.text) return { type: 'chunk', text: d.delta.text };
    if (d.type === 'message_stop' || d.type === 'result') return { type: 'message_end' };
    return null;
  } catch { return t.length > 0 ? { type: 'chunk', text: t } : null; }
}

// --- Session Manager ---
const sessions = new Map();

function createSession(mode, pitch) {
  if (sessions.size >= 3) return null;
  const id = randomUUID();
  const child = spawn('claude', ['--print', '--output-format', 'stream-json', '--verbose'], {
    cwd: __dir, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env },
  });
  child.stdin.write('/angel-investor-pitch-evaluator ' + mode + '\\n\\n' + pitch + '\\n');
  const session = { id, child, messages: [], active: true, eventHandlers: [], exitHandlers: [] };
  const rl = createInterface({ input: child.stdout });
  rl.on('line', (line) => { const e = parseStreamLine(line); if (e) session.eventHandlers.forEach((h) => h(e)); });
  child.stderr?.on('data', (d) => log('debug', { event: 'stderr', text: d.toString() }));
  child.on('exit', (code) => { session.active = false; session.exitHandlers.forEach((h) => h(code)); });
  sessions.set(id, session);
  log('info', { event: 'session_created', sessionId: id, pid: child.pid });
  return session;
}

function killSession(id) {
  const s = sessions.get(id);
  if (!s) return;
  if (!s.child.killed) { s.child.kill('SIGTERM'); setTimeout(() => { if (!s.child.killed) s.child.kill('SIGKILL'); }, 5000); }
  s.active = false;
  sessions.delete(id);
}

// --- PDF Generator ---
function extractMemo(messages) {
  const full = messages.join('\\n');
  const patterns = [/## Investment [Mm]emo[\\s\\S]*/, /\\*\\*Investment [Mm]emo\\*\\*[\\s\\S]*/, /\\*\\*Mode used\\*\\*[\\s\\S]*/, /\\*\\*Verdict\\*\\*[\\s\\S]*/];
  for (const p of patterns) { const m = full.match(p); if (m) return m[0]; }
  return full.length > 0 ? full : null;
}

function generatePdf(memo) {
  return new Promise((res, rej) => {
    const doc = new PDFDocument({ size: 'A4', margins: { top: 60, bottom: 60, left: 50, right: 50 },
      info: { Title: 'Investment Memo', Author: 'Angel Investor Pitch Evaluator' } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => res(Buffer.concat(chunks)));
    doc.on('error', rej);
    for (const line of memo.split('\\n')) {
      if (doc.y > doc.page.height - 80) doc.addPage();
      const t = line.trim();
      if (t.startsWith('### ')) { doc.moveDown(0.5); doc.font('Helvetica-Bold').fontSize(13).text(t.slice(4)); doc.moveDown(0.3); }
      else if (t.startsWith('## ')) { doc.moveDown(0.8); doc.font('Helvetica-Bold').fontSize(16).text(t.slice(3)); doc.moveDown(0.4); }
      else if (t.startsWith('# ')) { doc.moveDown(1); doc.font('Helvetica-Bold').fontSize(20).text(t.slice(2)); doc.moveDown(0.6); }
      else if (t.startsWith('- ') || t.startsWith('* ')) { doc.font('Helvetica').fontSize(11).text('  \\u2022  ' + t.slice(2), { indent: 10 }); doc.moveDown(0.2); }
      else if (t === '') { doc.moveDown(0.3); }
      else { doc.font('Helvetica').fontSize(11).text(t.replace(/\\*\\*(.+?)\\*\\*/g, '$1')); doc.moveDown(0.2); }
    }
    doc.end();
  });
}

// --- Upload Handler ---
function readReqBody(req, max) {
  return new Promise((res) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => { size += c.length; if (size > max) { req.destroy(); res(null); return; } chunks.push(c); });
    req.on('end', () => res(Buffer.concat(chunks)));
    req.on('error', () => res(null));
  });
}

function parseMultipart(body, boundary) {
  const parts = body.toString('latin1').split('--' + boundary);
  for (const part of parts) {
    if (part.includes('filename="')) {
      const fm = part.match(/filename="([^"]+)"/);
      const cm = part.match(/Content-Type:\\s*(.+)\\r?\\n/i);
      const he = part.indexOf('\\r\\n\\r\\n');
      if (fm && he !== -1) {
        let de = part.length;
        if (part.endsWith('\\r\\n')) de -= 2;
        else if (part.endsWith('\\r\\n--')) de -= 4;
        return { filename: fm[1], contentType: cm ? cm[1].trim() : 'application/octet-stream', data: Buffer.from(part.slice(he + 4, de), 'latin1') };
      }
    }
  }
  return null;
}

const uploadedFiles = new Map();

async function handleUpload(req, res) {
  const ct = req.headers['content-type'] || '';
  if (!ct.includes('multipart/form-data')) { res.writeHead(400); res.end('{"error":"Expected multipart/form-data"}'); return; }
  const boundary = ct.split('boundary=')[1];
  if (!boundary) { res.writeHead(400); res.end('{"error":"Missing boundary"}'); return; }
  const body = await readReqBody(req, MAX_UPLOAD);
  if (!body) { res.writeHead(413); res.end('{"error":"File too large (max 20MB)"}'); return; }
  const file = parseMultipart(body, boundary);
  if (!file) { res.writeHead(400); res.end('{"error":"Could not parse file"}'); return; }
  const ext = extname(file.filename).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) { res.writeHead(400); res.end(JSON.stringify({ error: 'File type ' + ext + ' not supported' })); return; }
  const safeName = file.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  await mkdir(UPLOAD_DIR, { recursive: true });
  const id = randomUUID();
  await writeFileFs(resolve(UPLOAD_DIR, id + ext), file.data);
  uploadedFiles.set(id, { path: resolve(UPLOAD_DIR, id + ext), name: safeName });
  log('info', { event: 'file_uploaded', id, name: safeName, size: file.data.length });
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ id, name: safeName, size: file.data.length }));
}

// --- Static File Server ---
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json' };

async function serveStatic(req, res) {
  const url = req.url === '/' ? '/index.html' : req.url;
  const fp = resolve(UI_DIR, url.slice(1));
  if (!fp.startsWith(UI_DIR)) { res.writeHead(403); res.end(); return true; }
  try { const c = await readFile(fp); res.writeHead(200, { 'Content-Type': MIME[extname(fp)] || 'application/octet-stream' }); res.end(c); return true; }
  catch { return false; }
}

// --- HTTP Server ---
const server = createServer(async (req, res) => {
  // Health
  if (req.url === '/healthz') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"status":"alive"}'); return; }
  if (req.url === '/api/v1/status') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(await checkCli())); return; }

  // Upload
  if (req.url === '/api/v1/upload' && req.method === 'POST') {
    try { await handleUpload(req, res); } catch (e) { log('error', { event: 'upload_failed', error: String(e) }); res.writeHead(500); res.end('{"error":"Upload failed"}'); }
    return;
  }

  // PDF
  if (req.url === '/api/v1/memo/pdf' && req.method === 'POST') {
    const chunks = []; req.on('data', (c) => chunks.push(c));
    req.on('end', async () => {
      try {
        const { sessionId } = JSON.parse(Buffer.concat(chunks).toString());
        const session = sessions.get(sessionId);
        if (!session) { res.writeHead(404); res.end('{"error":"Session not found"}'); return; }
        const memo = extractMemo(session.messages);
        if (!memo) { res.writeHead(400); res.end('{"error":"No memo found"}'); return; }
        const pdf = await generatePdf(memo);
        res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="investment-memo.pdf"', 'Content-Length': pdf.length });
        res.end(pdf);
      } catch (e) { res.writeHead(500); res.end('{"error":"PDF generation failed"}'); }
    });
    return;
  }

  // Static
  if (await serveStatic(req, res)) return;
  res.writeHead(404); res.end('{"error":"Not found"}');
});

// --- WebSocket ---
const ModeSchema = z.enum(['sparring', 'coaching', 'masterclass']);
const ClientMsg = z.discriminatedUnion('type', [
  z.object({ type: z.literal('start'), mode: ModeSchema, pitch: z.string().min(1) }),
  z.object({ type: z.literal('message'), text: z.string().min(1) }),
  z.object({ type: z.literal('end') }),
]);

const wss = new WebSocketServer({ server, path: '/ws' });
function wsSend(ws, msg) { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg)); }

wss.on('connection', (ws) => {
  let sid = null;
  ws.on('message', (raw) => {
    let parsed; try { parsed = ClientMsg.parse(JSON.parse(raw.toString())); } catch { wsSend(ws, { type: 'error', message: 'Invalid message' }); return; }

    if (parsed.type === 'start') {
      if (sid) { wsSend(ws, { type: 'error', message: 'Session active' }); return; }
      wsSend(ws, { type: 'status', status: 'spawning' });
      const session = createSession(parsed.mode, parsed.pitch);
      if (!session) { wsSend(ws, { type: 'error', message: 'Max sessions reached' }); return; }
      sid = session.id;
      wsSend(ws, { type: 'status', status: 'ready', detail: sid });
      session.eventHandlers.push((e) => {
        if (e.type === 'chunk') { session.messages.push(e.text); wsSend(ws, e); }
        if (e.type === 'message_end') wsSend(ws, e);
      });
      session.exitHandlers.push(() => wsSend(ws, { type: 'session_end', memoAvailable: session.messages.length > 0 }));
    }
    if (parsed.type === 'message' && sid) { const s = sessions.get(sid); if (s?.active) s.child.stdin.write(parsed.text + '\\n'); }
    if (parsed.type === 'end' && sid) { killSession(sid); sid = null; wsSend(ws, { type: 'session_end', memoAvailable: true }); }
  });
  ws.on('close', () => { if (sid) killSession(sid); });
});

// --- Start ---
server.listen(PORT, () => {
  log('info', { event: 'server_started', port: PORT });
  console.log('');
  console.log('  Angel Investor Pitch Evaluator');
  console.log('  http://localhost:' + PORT);
  console.log('');
  console.log('  Press Ctrl+C to stop.');
  console.log('');
});

process.on('SIGTERM', () => { server.close(); sessions.forEach((_, id) => killSession(id)); process.exit(0); });
process.on('SIGINT', () => { server.close(); sessions.forEach((_, id) => killSession(id)); process.exit(0); });
`);

console.log('6. Copying dependencies for portable...');
// For portable, we need ws, pdfkit, zod as node_modules next to app.mjs
// since esbuild can't always fully bundle native-ish modules
execSync('cp -r node_modules ' + resolve(DIST, 'node_modules'), { cwd: ROOT });

console.log('\n=== Build complete ===');
console.log(`Output: dist/pitch-evaluator-portable/`);
console.log('\nContents:');
console.log('  start.bat           — Double-click to launch');
console.log('  download-node.ps1   — Auto-downloads Node.js if needed');
console.log('  app.mjs             — Bundled application');
console.log('  ui/                 — Web interface');
console.log('  skills/             — Pitch evaluator skill');
console.log('  node_modules/       — Dependencies');
console.log('  runtime/            — (Portable Node.js, downloaded on first run)');
console.log('  SETUP-GUIDE.md      — User guide');
