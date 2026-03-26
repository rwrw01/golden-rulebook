/**
 * Fetch object details from BlueDolphin API and store in enrich_cache table.
 * Does NOT modify the objects table — only caches raw API responses.
 * Usage: npx tsx src/data/enrich-cache.ts [maxCalls] [typeFilter]
 * Examples:
 *   npx tsx src/data/enrich-cache.ts 1000              # fetch up to 1000, apps first
 *   npx tsx src/data/enrich-cache.ts 500 Applicatie     # only Applicaties
 */
import Database from 'better-sqlite3';
import { join } from 'node:path';

import {
  type ObjectDetail,
  fetchApi,
  sleep,
  getHeaders,
  setCallLimit,
  getCallCount,
  isAtLimit,
  DELAY_MS,
} from './sync-helpers.js';

const DB_PATH = join(import.meta.dirname!, '..', '..', 'data', 'impact.db');
const MAX_CALLS = parseInt(process.argv[2] ?? '1000', 10);
const TYPE_FILTER = process.argv[3] ?? '';

async function main(): Promise<void> {
  setCallLimit(MAX_CALLS);
  const headers = getHeaders();
  const db = new Database(DB_PATH);

  // Ensure cache table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS enrich_cache (
      object_id TEXT PRIMARY KEY,
      raw_json TEXT NOT NULL,
      fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Find objects not yet in cache
  const typeClause = TYPE_FILTER
    ? `AND ot.name = '${TYPE_FILTER}'`
    : '';
  const stubs = db.prepare(`
    SELECT o.id, o.title, ot.name as type_name
    FROM objects o
    JOIN object_types ot ON o.type_id = ot.template_id
    WHERE o.is_template = 0
      AND o.id NOT IN (SELECT object_id FROM enrich_cache)
      ${typeClause}
    ORDER BY
      CASE ot.name
        WHEN 'Applicatie' THEN 1
        WHEN 'Bedrijfsproces' THEN 2
        WHEN 'Actor' THEN 3
        WHEN 'Gegevensobject' THEN 4
        ELSE 5
      END,
      o.title
    LIMIT ?
  `).all(MAX_CALLS) as Array<{ id: string; title: string; type_name: string }>;

  console.log(`=== ENRICH CACHE — max ${MAX_CALLS} calls ===`);
  console.log(`Te fetchen: ${stubs.length} objecten${TYPE_FILTER ? ` (type: ${TYPE_FILTER})` : ''}\n`);

  const insert = db.prepare(`
    INSERT OR REPLACE INTO enrich_cache (object_id, raw_json) VALUES (?, ?)
  `);

  let success = 0;
  let fail = 0;
  let currentType = '';

  for (let i = 0; i < stubs.length; i++) {
    if (isAtLimit()) break;
    const obj = stubs[i];

    if (obj.type_name !== currentType) {
      if (currentType) console.log(`  → ${success} opgehaald\n`);
      currentType = obj.type_name;
      const remaining = stubs.filter(s => s.type_name === currentType).length;
      console.log(`${currentType}: ${remaining} objecten`);
    }

    try {
      const detail = await fetchApi('/api/objectitem/' + obj.id, headers);
      insert.run(obj.id, JSON.stringify(detail));
      success++;
    } catch {
      fail++;
    }

    if ((i + 1) % 50 === 0) {
      console.log(`  ${i + 1}/${stubs.length}... (${getCallCount()}/${MAX_CALLS})`);
    }

    await sleep(DELAY_MS);
  }

  if (currentType) console.log(`  → ${success} opgehaald\n`);

  const cached = db.prepare('SELECT count(*) as n FROM enrich_cache').get() as { n: number };
  console.log(`=== KLAAR ===`);
  console.log(`Opgehaald: ${success}, Mislukt: ${fail}`);
  console.log(`Totaal in cache: ${cached.n}`);

  db.close();
}

main().catch((err: unknown) => { console.error('Fatal:', err); process.exit(1); });
