/**
 * Map locations to applications via presentation API
 * Strategy: fetch 42 locations, per location fetch detail + filter app relations
 * Much faster than fetching 772 app details individually
 */
import Database from 'better-sqlite3';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';

import { getAuthHeaders } from '../../observer/src/cookie-extractor.js';

const OBSERVER_DB = join(import.meta.dirname!, '..', '..', 'observer', 'data', 'observer.db');
const BASE_URL = 'https://bd-presentation-api.eu.bd-cloud.app';
const AUTH_DOMAIN = 'bd-presentation-api.eu.bd-cloud.app';
const TENANT = 'leiden';
const SESSION_ID = 7;
const DELAY_MS = 1000;

const TEMPLATE_APPLICATIE = '532fffd0b41281c17ce263b9';
const TEMPLATE_LOCATIE = '532ffa70b41281c17ce263b5';

interface RelatedObject {
  object_id: string;
  object_title: string;
  object_type: { template_id: string; name: string };
  relationship: { name: string; type: string };
}

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
  const db = new Database(OBSERVER_DB, { readonly: true });
  const authHeaders = getAuthHeaders(db, SESSION_ID, AUTH_DOMAIN);
  db.close();

  if (!authHeaders) { console.error('No auth headers'); process.exit(1); }

  const headers: Record<string, string> = {
    ...authHeaders,
    'Accept': 'application/json',
    'tenant': TENANT,
  };

  // Step 1: Fetch all locations (42 items)
  const locData = await fetchApi(
    `/api/objectlist/${TEMPLATE_LOCATIE}?start=-1&take=100&is_archived=false`, headers,
  ) as { items: Array<{ id: string; title: string }> };
  const locations = locData.items.filter(l => !l.title.startsWith('(c)'));
  console.log(`${locations.length} locaties gevonden`);
  await sleep(DELAY_MS);

  // Step 2: Per location, fetch detail and find app relations
  const mappings: Array<{ loc: string; app: string; rel: string }> = [];

  for (const loc of locations) {
    const detail = await fetchApi(`/api/objectitem/${loc.id}`, headers) as {
      related_bluedolphin_objects: RelatedObject[];
    };

    const appRels = detail.related_bluedolphin_objects.filter(
      r => r.object_type.template_id === TEMPLATE_APPLICATIE,
    );

    for (const rel of appRels) {
      mappings.push({ loc: loc.title, app: rel.object_title, rel: rel.relationship.name });
    }

    console.log(`  ${loc.title}: ${appRels.length} apps`);
    await sleep(DELAY_MS);
  }

  // Summary
  console.log(`\n=== RESULTAAT: ${mappings.length} koppelingen ===\n`);

  const byLoc: Record<string, string[]> = {};
  for (const m of mappings) {
    if (!byLoc[m.loc]) byLoc[m.loc] = [];
    byLoc[m.loc].push(m.app);
  }
  for (const [loc, apps] of Object.entries(byLoc)) {
    console.log(`${loc}: ${apps.length} apps`);
  }

  // Save JSON
  const outputPath = join(import.meta.dirname!, '..', 'data', 'app-location-scan.json');
  writeFileSync(outputPath, JSON.stringify({ mappings, byLocation: byLoc, timestamp: new Date().toISOString() }, null, 2));
  console.log(`\nOpgeslagen: ${outputPath}`);
}

main().catch((err: unknown) => { console.error('Fatal:', err); process.exit(1); });
