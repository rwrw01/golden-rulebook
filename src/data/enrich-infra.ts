/**
 * Enrich all infrastructure stubs: fetch their detail + relations
 * Targets: Netwerken, Netwerk Devices, Apparaten without raw_json
 */
import {
  fetchApi,
  sleep,
  getHeaders,
  initDatabase,
  storeObjectWithRelations,
  setCallLimit,
  getCallCount,
  isAtLimit,
  DELAY_MS,
  type ObjectDetail,
} from './sync-helpers.js';

const MAX_CALLS = 200;

async function main(): Promise<void> {
  setCallLimit(MAX_CALLS);
  const headers = getHeaders();
  const db = initDatabase();

  // Find all infra stubs
  const stubs = db.prepare(`
    SELECT o.id, o.title, o.type_id, ot.name as type_name
    FROM objects o
    JOIN object_types ot ON o.type_id = ot.template_id
    WHERE (o.raw_json = '' OR o.raw_json IS NULL)
    AND o.type_id IN (
      '610a7682ad3fc20e30dd2cba',
      '610a76b0ad3fc0094ca7eca0',
      '5f917a72145c106fa002aed3',
      '5faa8d3aad3fc213ecfca3a6',
      '61b76634ad3fbd0b08644d4d',
      '5a783e5bbbe61e0c4860e747'
    )
    ORDER BY ot.name, o.title
  `).all() as Array<{ id: string; title: string; type_id: string; type_name: string }>;

  console.log(`${stubs.length} infra-stubs te verrijken (max ${MAX_CALLS} calls)\n`);

  // Group by type for logging
  const byType = new Map<string, number>();
  for (const s of stubs) byType.set(s.type_name, (byType.get(s.type_name) ?? 0) + 1);
  for (const [type, count] of byType) console.log(`  ${type}: ${count}`);
  console.log('');

  let enriched = 0;
  let relations = 0;

  for (let i = 0; i < stubs.length; i++) {
    if (isAtLimit()) {
      console.log(`\nCall-limiet bereikt bij ${i}/${stubs.length}`);
      break;
    }

    const stub = stubs[i];
    if ((i + 1) % 20 === 0) console.log(`  ${i + 1}/${stubs.length}... (${getCallCount()}/${MAX_CALLS} calls)`);

    try {
      const detail = await fetchApi('/api/objectitem/' + stub.id, headers) as ObjectDetail;
      const relCount = storeObjectWithRelations(db, stub.id, detail, stub.type_id, stub.title);
      enriched++;
      relations += relCount;
    } catch {
      // Object might be archived/deleted
    }

    await sleep(DELAY_MS);
  }

  // Stats
  console.log(`\n=== VERRIJKING KLAAR ===`);
  console.log(`API calls: ${getCallCount()}/${MAX_CALLS}`);
  console.log(`Verrijkt: ${enriched} objecten`);
  console.log(`Nieuwe relaties: ${relations}`);

  // Check Palo Alto now
  const paloRels = db.prepare(`
    SELECT o.title, ot.name as type, r.relationship_type
    FROM relationships r
    JOIN objects o ON (o.id = r.source_id OR o.id = r.target_id)
    JOIN object_types ot ON o.type_id = ot.template_id
    WHERE (r.source_id IN (SELECT id FROM objects WHERE title LIKE '%Palo Alto STK%')
        OR r.target_id IN (SELECT id FROM objects WHERE title LIKE '%Palo Alto STK%'))
    AND o.title NOT LIKE '%Palo Alto STK%'
  `).all() as Array<{ title: string; type: string; relationship_type: string }>;

  console.log(`\nPalo Alto STK relaties na verrijking: ${paloRels.length}`);
  for (const r of paloRels) console.log(`  [${r.type}] ${r.title} (${r.relationship_type})`);

  db.close();
}

main().catch((err: unknown) => { console.error('Fatal:', err); process.exit(1); });
