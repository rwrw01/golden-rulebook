/**
 * Enrich stubs across all object types, prioritized by impact value
 * Usage: npx tsx src/data/enrich-all.ts [maxCalls]
 */
import {
  type ObjectDetail,
  fetchApi,
  sleep,
  getHeaders,
  initDatabase,
  storeObjectWithRelations,
  setCallLimit,
  getCallCount,
  isAtLimit,
  DELAY_MS,
} from './sync-helpers.js';

const MAX_CALLS = parseInt(process.argv[2] ?? '1500', 10);

// Priority order: most valuable stubs first
const PRIORITY_TYPES = [
  { id: '532fffd0b41281c17ce263b9', name: 'Applicatie',            limit: 500 },
  { id: '610a7682ad3fc20e30dd2cba', name: 'Netwerk',              limit: 50 },
  { id: '610a76b0ad3fc0094ca7eca0', name: 'Netwerk Device',       limit: 50 },
  { id: '5f917a72145c106fa002aed3', name: 'Apparaat',             limit: 30 },
  { id: '5faa8d3aad3fc213ecfca3a6', name: 'Node',                 limit: 50 },
  { id: '531721d799ffecf9b5c8b1ad', name: 'Bedrijfsproces',       limit: 140 },
  { id: '532ff9dbb41281c17ce263b2', name: 'Actor',                limit: 100 },
  { id: '5852ada13bf3ff08c475d1fd', name: 'Bedrijfsfunctie',      limit: 50 },
  { id: '532ffa70b41281c17ce263b5', name: 'Locatie',              limit: 40 },
  { id: '61b76634ad3fbd0b08644d4d', name: 'Database',             limit: 50 },
  { id: '5a783e5bbbe61e0c4860e747', name: 'Technologie-interface',limit: 120 },
  { id: '6954f849eb75672476bc0648', name: 'Applicatieservice',    limit: 100 },
  { id: '532fff7eb41281c17ce263b6', name: 'Applicatie-interface', limit: 100 },
  { id: '53ce29f38ffdac058cff1ced', name: 'Bedrijfsobject',       limit: 100 },
  { id: '5a1ecc07552b130a54b79631', name: 'Gegevensobject',       limit: 50 },
];

async function main(): Promise<void> {
  setCallLimit(MAX_CALLS);
  const headers = getHeaders();
  const db = initDatabase();

  const syncId = db.prepare(
    "INSERT INTO sync_runs (status) VALUES ('running') RETURNING id",
  ).get() as { id: number };

  let totalEnriched = 0;
  let totalRelations = 0;

  console.log(`=== BREDE VERRIJKING — max ${MAX_CALLS} calls ===\n`);

  for (const type of PRIORITY_TYPES) {
    if (isAtLimit()) break;

    const stubs = db.prepare(`
      SELECT id, title FROM objects
      WHERE type_id = ? AND (raw_json = '' OR raw_json IS NULL) AND is_template = 0
      LIMIT ?
    `).all(type.id, type.limit) as Array<{ id: string; title: string }>;

    if (stubs.length === 0) continue;

    console.log(`${type.name}: ${stubs.length} stubs`);
    let enriched = 0;
    let relations = 0;

    for (let i = 0; i < stubs.length; i++) {
      if (isAtLimit()) {
        console.log(`  ⏹ Limiet bij ${i}/${stubs.length}`);
        break;
      }

      if ((i + 1) % 50 === 0) {
        console.log(`  ${i + 1}/${stubs.length}... (${getCallCount()}/${MAX_CALLS})`);
      }

      try {
        const detail = await fetchApi('/api/objectitem/' + stubs[i].id, headers) as ObjectDetail;
        const relCount = storeObjectWithRelations(db, stubs[i].id, detail, type.id, stubs[i].title);
        enriched++;
        relations += relCount;
      } catch {
        // archived/deleted — skip
      }

      await sleep(DELAY_MS);
    }

    totalEnriched += enriched;
    totalRelations += relations;
    console.log(`  → ${enriched} verrijkt, ${relations} relaties\n`);
  }

  // Update sync run
  db.prepare(`
    UPDATE sync_runs SET finished_at = datetime('now'), status = 'completed',
      objects_synced = ?, relations_synced = ? WHERE id = ?
  `).run(totalEnriched, totalRelations, syncId.id);

  // Final stats
  const stats = db.prepare(`
    SELECT
      (SELECT count(*) FROM objects WHERE is_template = 0) as objects,
      (SELECT count(*) FROM objects WHERE is_template = 0 AND raw_json != '' AND raw_json IS NOT NULL) as with_detail,
      (SELECT count(*) FROM relationships) as relations
  `).get() as { objects: number; with_detail: number; relations: number };

  console.log(`=== KLAAR ===`);
  console.log(`API calls: ${getCallCount()}/${MAX_CALLS}`);
  console.log(`Verrijkt: ${totalEnriched} objecten, ${totalRelations} nieuwe relaties`);
  console.log(`\nDatabase totaal:`);
  console.log(`  Objecten: ${stats.objects} (${stats.with_detail} met detail = ${Math.round(stats.with_detail/stats.objects*100)}%)`);
  console.log(`  Relaties: ${stats.relations}`);

  db.close();
}

main().catch((err: unknown) => { console.error('Fatal:', err); process.exit(1); });
