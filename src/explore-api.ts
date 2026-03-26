/**
 * BlueDolphin API Explorer — Map applications to locations
 *
 * Usage: npx tsx src/explore-api.ts
 *
 * Reads captured auth headers from the observer DB and calls
 * BlueDolphin API to find all application → location relationships.
 *
 * Prerequisites:
 * - Run observer with captureAuthHeaders: true on BlueDolphin
 * - Session must have captured authorization + b2cauthorization headers
 */
import Database from 'better-sqlite3';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';

import { getAuthHeaders } from '../../observer/src/cookie-extractor.js';

const OBSERVER_DB = join(import.meta.dirname!, '..', '..', 'observer', 'data', 'observer.db');
const BASE_URL = 'https://bd-presentation-api.eu.bd-cloud.app';
const AUTH_DOMAIN = 'bd-presentation-api.eu.bd-cloud.app';
const TENANT = 'leiden';
const DELAY_MS = 1000;

/** Session ID in observer DB */
const SESSION_ID = 7;

/** BlueDolphin template IDs (discovered from API) */
const TEMPLATE_APPLICATIE = '532fffd0b41281c17ce263b9';
const TEMPLATE_LOCATIE = '532ffa70b41281c17ce263b5';

interface ObjectItem {
  id: string;
  title: string;
  object_type: { template_id: string; name: string };
}

interface RelatedObject {
  object_id: string;
  object_title: string;
  object_type: { template_id: string; name: string };
  relationship: { name: string; type: string };
}

interface ObjectDetail {
  title: string;
  related_bluedolphin_objects: RelatedObject[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchApi(path: string, headers: Record<string, string>): Promise<unknown> {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, { headers });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
  }

  const json = await res.json() as {
    error_code: number;
    error_message: string | null;
    data: unknown;
  };

  if (json.error_code !== 0) {
    throw new Error(`API error ${json.error_code}: ${json.error_message}`);
  }

  return json.data;
}

async function fetchAllItems(
  templateId: string,
  headers: Record<string, string>,
): Promise<ObjectItem[]> {
  const data = await fetchApi(
    `/api/objectlist/${templateId}?start=-1&take=1000&is_archived=false`,
    headers,
  ) as { items: ObjectItem[] };
  return data.items;
}

async function fetchObjectDetail(
  objectId: string,
  headers: Record<string, string>,
): Promise<ObjectDetail> {
  return await fetchApi(`/api/objectitem/${objectId}`, headers) as ObjectDetail;
}

async function main(): Promise<void> {
  const db = new Database(OBSERVER_DB, { readonly: true });
  const authHeaders = getAuthHeaders(db, SESSION_ID, AUTH_DOMAIN);
  db.close();

  if (!authHeaders) {
    console.error('No auth headers found for session', SESSION_ID);
    process.exit(1);
  }

  console.log(`Auth headers loaded: ${Object.keys(authHeaders).join(', ')}`);

  const headers: Record<string, string> = {
    ...authHeaders,
    'Accept': 'application/json',
    'tenant': TENANT,
  };

  // ── Stap 1: Fetch all applications ──
  console.log('\n═══ STAP 1: Alle applicaties ophalen ═══');
  const applicaties = await fetchAllItems(TEMPLATE_APPLICATIE, headers);
  console.log(`${applicaties.length} applicaties gevonden`);
  await sleep(DELAY_MS);

  // ── Stap 2: Fetch all locations (for reference) ──
  console.log('\n═══ STAP 2: Alle locaties ophalen ═══');
  const locaties = await fetchAllItems(TEMPLATE_LOCATIE, headers);
  console.log(`${locaties.length} locaties gevonden:`);
  for (const loc of locaties) {
    console.log(`  - ${loc.title} (${loc.id})`);
  }
  await sleep(DELAY_MS);

  // ── Stap 3: Per applicatie, haal detail op en zoek locatie-relaties ──
  console.log('\n═══ STAP 3: Applicatie → Locatie koppelingen ═══');

  const mappings: Array<{
    appTitle: string;
    appId: string;
    locTitle: string;
    locId: string;
    relationType: string;
    relationName: string;
  }> = [];

  let processed = 0;
  for (const app of applicaties) {
    processed++;
    if (processed % 20 === 0) {
      console.log(`  ... ${processed}/${applicaties.length} verwerkt`);
    }

    const detail = await fetchObjectDetail(app.id, headers);

    const locationRelations = detail.related_bluedolphin_objects.filter(
      (rel) => rel.object_type.template_id === TEMPLATE_LOCATIE,
    );

    for (const rel of locationRelations) {
      mappings.push({
        appTitle: detail.title,
        appId: app.id,
        locTitle: rel.object_title,
        locId: rel.object_id,
        relationType: rel.relationship.type,
        relationName: rel.relationship.name,
      });
    }

    await sleep(DELAY_MS);
  }

  // ── Output ──
  console.log(`\n═══ RESULTAAT: ${mappings.length} koppelingen gevonden ═══\n`);

  if (mappings.length === 0) {
    console.log('Geen directe applicatie → locatie koppelingen gevonden.');
    console.log('Mogelijk lopen relaties via een tussenlaag (bijv. bedrijfsproces of functie).');
  } else {
    console.log('Applicatie | Locatie | Relatietype');
    console.log('---|---|---');
    for (const m of mappings) {
      console.log(`${m.appTitle} | ${m.locTitle} | ${m.relationName} (${m.relationType})`);
    }
  }

  // Save full results as JSON
  const outputPath = join(import.meta.dirname!, '..', 'data', 'app-location-mappings.json');
  writeFileSync(outputPath, JSON.stringify({ mappings, applicaties: applicaties.length, locaties: locaties.length, timestamp: new Date().toISOString() }, null, 2));
  console.log(`\nResultaten opgeslagen in ${outputPath}`);
}

main().catch((err: unknown) => {
  console.error('Fatal:', err);
  process.exit(1);
});
