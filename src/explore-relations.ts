/**
 * Discover the full BlueDolphin relation model.
 * 1. Fetch all objects via /api/objectlist/all (paginated) to discover object types + counts
 * 2. Pick 1 representative from each of the top 10 most-populated types (skip "(c)" names)
 * 3. Fetch detail for each via /api/objectitem/{id}
 * 4. Collect all unique relationship patterns
 * 5. Save to data/relation-model.json
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

interface ObjectTypeInfo {
  template_id: string;
  name: string;
  count: number;
  sample_id: string;
  sample_title: string;
}

interface RelatedObject {
  object_id: string;
  object_title: string;
  object_type: { template_id: string; name: string };
  relationship: { name: string; type: string };
}

interface RelationPattern {
  source_type: string;
  relationship_name: string;
  relationship_type: string;
  target_type: string;
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

  // Step 1: Fetch all objects in pages to discover types
  console.log('Fetching all objects to discover types...');
  const PAGE_SIZE = 5000;
  const typeMap = new Map<string, ObjectTypeInfo>();
  let fetched = 0;
  let totalItems = 0;

  for (let page = 0; ; page++) {
    const start = page * PAGE_SIZE;
    const data = await fetchApi(
      `/api/objectlist/all?start=${start}&take=${PAGE_SIZE}&is_archived=false`,
      headers,
    ) as {
      items: Array<{ id: string; title: string; object_type: { template_id: string; name: string } }>;
      total_items: number;
    };
    await sleep(DELAY_MS);

    if (page === 0) {
      totalItems = data.total_items;
      console.log(`  Total objects: ${totalItems}`);
    }

    for (const item of data.items) {
      const tid = item.object_type.template_id;
      const existing = typeMap.get(tid);
      if (existing) {
        existing.count++;
      } else {
        typeMap.set(tid, {
          template_id: tid,
          name: item.object_type.name,
          count: 1,
          sample_id: item.id,
          sample_title: item.title,
        });
      }
    }

    fetched += data.items.length;
    console.log(`  Page ${page}: ${data.items.length} items (${fetched}/${totalItems})`);

    if (fetched >= totalItems || data.items.length === 0) break;
  }

  // Sort by count descending
  const objectTypes = [...typeMap.values()].sort((a, b) => b.count - a.count);

  console.log(`\n=== ALL OBJECT TYPES (${objectTypes.length}) ===`);
  for (const ot of objectTypes) {
    console.log(`  ${String(ot.count).padStart(5)} | ${ot.name} (${ot.template_id})`);
  }

  // Step 2: Pick top 10, skip "(c)" titles
  // For each type, find a sample whose title doesn't start with "(c)"
  // We already have one sample per type from the scan; if it starts with (c), we'll still use it
  // but we skip types whose NAME starts with "(c)"
  const top10 = objectTypes
    .filter((t) => !t.name.startsWith('(c)'))
    .slice(0, 10);

  console.log(`\n=== TOP 10 (sampling 1 each) ===`);
  for (const t of top10) {
    console.log(`  ${t.name} (${t.count}) -> sample: "${t.sample_title}"`);
  }

  // Step 3: Fetch detail for each sample
  const allPatterns: RelationPattern[] = [];
  const sampleDetails: Array<{
    type_name: string;
    template_id: string;
    object_id: string;
    object_title: string;
    relation_count: number;
  }> = [];

  for (const t of top10) {
    console.log(`\nFetching detail for "${t.sample_title}" (${t.name})...`);
    const detail = await fetchApi(`/api/objectitem/${t.sample_id}`, headers) as {
      related_bluedolphin_objects: RelatedObject[];
    };
    await sleep(DELAY_MS);

    const rels = detail.related_bluedolphin_objects ?? [];
    console.log(`  Relations: ${rels.length}`);

    sampleDetails.push({
      type_name: t.name,
      template_id: t.template_id,
      object_id: t.sample_id,
      object_title: t.sample_title,
      relation_count: rels.length,
    });

    for (const r of rels) {
      allPatterns.push({
        source_type: t.name,
        relationship_name: r.relationship.name,
        relationship_type: r.relationship.type,
        target_type: r.object_type.name,
      });
    }
  }

  // Step 4: Deduplicate patterns
  const patternSet = new Set<string>();
  const uniquePatterns: RelationPattern[] = [];
  for (const p of allPatterns) {
    const key = `${p.source_type}|${p.relationship_name}|${p.relationship_type}|${p.target_type}`;
    if (!patternSet.has(key)) {
      patternSet.add(key);
      uniquePatterns.push(p);
    }
  }

  uniquePatterns.sort((a, b) =>
    a.source_type.localeCompare(b.source_type) || a.target_type.localeCompare(b.target_type),
  );

  // Step 5: Summary
  console.log(`\n=== UNIQUE RELATIONSHIP PATTERNS (${uniquePatterns.length}) ===`);
  for (const p of uniquePatterns) {
    console.log(`  ${p.source_type} --[${p.relationship_name} (${p.relationship_type})]-> ${p.target_type}`);
  }

  // Step 6: Save results
  const result = {
    timestamp: new Date().toISOString(),
    total_objects: totalItems,
    object_types: objectTypes.map(({ sample_id: _s, sample_title: _t, ...rest }) => rest),
    sampled_top10: sampleDetails,
    unique_relationship_patterns: uniquePatterns,
  };

  const outputPath = join(import.meta.dirname!, '..', 'data', 'relation-model.json');
  writeFileSync(outputPath, JSON.stringify(result, null, 2));
  console.log(`\nSaved: ${outputPath}`);
  console.log('Done.');
}

main().catch((err: unknown) => { console.error('Fatal:', err); process.exit(1); });
