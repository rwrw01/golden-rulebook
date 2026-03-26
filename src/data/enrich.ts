/**
 * Enrich stub objects (title = "(unknown)") by fetching their detail from BD API
 */
import Database from 'better-sqlite3';
import { join } from 'node:path';

import { getAuthHeaders } from '../../../observer/src/cookie-extractor.js';

const OBSERVER_DB = join(import.meta.dirname!, '..', '..', '..', 'observer', 'data', 'observer.db');
const IMPACT_DB = join(import.meta.dirname!, '..', '..', 'data', 'impact.db');
const BASE_URL = 'https://bd-presentation-api.eu.bd-cloud.app';
const AUTH_DOMAIN = 'bd-presentation-api.eu.bd-cloud.app';
const TENANT = 'leiden';
const SESSION_ID = 7;
const DELAY_MS = 800;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchApi(path: string, headers: Record<string, string>): Promise<unknown> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${BASE_URL}${path}`, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
      const json = await res.json() as { error_code: number; data: unknown };
      if (json.error_code !== 0) throw new Error(`API error ${json.error_code}`);
      return json.data;
    } catch (err) {
      if (attempt === 2) throw err;
      console.log(`  retry ${attempt + 1} for ${path}`);
      await sleep(3000);
    }
  }
  throw new Error('unreachable');
}

async function main(): Promise<void> {
  const obsDb = new Database(OBSERVER_DB, { readonly: true });
  const authHeaders = getAuthHeaders(obsDb, SESSION_ID, AUTH_DOMAIN);
  obsDb.close();
  if (!authHeaders) { console.error('No auth headers'); process.exit(1); }

  const headers: Record<string, string> = {
    ...authHeaders,
    'Accept': 'application/json',
    'tenant': TENANT,
  };

  const db = new Database(IMPACT_DB);

  // Find objects that need enrichment (unknown title OR empty raw_json for important types)
  const stubs = db.prepare(
    "SELECT id, type_id FROM objects WHERE title = '(unknown)' OR (raw_json = '' AND type_id IN ('531721d799ffecf9b5c8b1ad','5852ada13bf3ff08c475d1fd','532ff9dbb41281c17ce263b2','5ebd0aebc572da66245eca13'))",
  ).all() as Array<{ id: string; type_id: string }>;

  console.log(stubs.length + " objecten te verrijken");

  const update = db.prepare(
    "UPDATE objects SET title = ?, raw_json = ?, synced_at = datetime('now') WHERE id = ?",
  );

  let enriched = 0;
  for (let i = 0; i < stubs.length; i++) {
    if ((i + 1) % 20 === 0) console.log("  " + (i + 1) + "/" + stubs.length + "...");

    try {
      const detail = await fetchApi("/api/objectitem/" + stubs[i].id, headers) as { title: string };
      update.run(detail.title ?? "(unknown)", JSON.stringify(detail), stubs[i].id);
      enriched++;
    } catch {
      // Object might be deleted/archived — skip
    }

    await sleep(DELAY_MS);
  }

  console.log(enriched + " verrijkt");

  // Re-validate
  const chains = db.prepare(
    "SELECT app_title, process_title, function_title, actor_title FROM v_impact_chain WHERE process_title != '(unknown)' LIMIT 5",
  ).all() as Array<{ app_title: string; process_title: string; function_title: string | null; actor_title: string | null }>;
  console.log("\nVoorbeeld impactketens:");
  for (const c of chains) {
    console.log("  " + c.app_title + " > " + c.process_title + " > " + (c.function_title ?? "-") + " > " + (c.actor_title ?? "-"));
  }

  db.close();
}

main().catch((err: unknown) => { console.error('Fatal:', err); process.exit(1); });
