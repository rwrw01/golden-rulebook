/**
 * Broad sync: fetch applications, locations & infrastructure from BlueDolphin
 * Limited to MAX_CALLS API requests for testing
 */
import {
  type ListItem,
  type ObjectDetail,
  fetchApi,
  sleep,
  getHeaders,
  initDatabase,
  upsertObjectType,
  storeObjectWithRelations,
  setCallLimit,
  getCallCount,
  isAtLimit,
  DELAY_MS,
} from './sync-helpers.js';

// ── Config ──
const MAX_CALLS = 800;

// Template IDs for primary object types
const OBJECT_TYPES = {
  applicatie:      { id: '532fffd0b41281c17ce263b9', name: 'Applicatie' },
  locatie:         { id: '532ffa70b41281c17ce263b5', name: 'Locatie' },
  node:            { id: '5faa8d3aad3fc213ecfca3a6', name: 'Node' },
  database:        { id: '61b76634ad3fbd0b08644d4d', name: 'Database' },
  netwerk:         { id: '610a7682ad3fc20e30dd2cba', name: 'Netwerk' },
  netwerkDevice:   { id: '610a76b0ad3fc0094ca7eca0', name: 'Netwerk Device' },
  apparaat:        { id: '5f917a72145c106fa002aed3', name: 'Apparaat' },
} as const;

async function fetchObjectList(
  templateId: string,
  headers: Record<string, string>,
): Promise<ListItem[]> {
  if (isAtLimit()) return [];
  const data = await fetchApi(
    `/api/objectlist/${templateId}?start=-1&take=5000&is_archived=false`,
    headers,
  ) as { items: ListItem[]; total_items: number };
  console.log(`  Lijst: ${data.total_items} items (${data.items.length} opgehaald)`);
  return data.items.filter(i => !i.title.startsWith('(c)'));
}

async function fetchAndStoreDetails(
  items: ListItem[],
  typeId: string,
  typeName: string,
  db: ReturnType<typeof initDatabase>,
  headers: Record<string, string>,
  limit: number,
): Promise<{ objects: number; relations: number }> {
  // Skip items we already have full detail for
  const existing = new Set(
    (db.prepare(
      "SELECT id FROM objects WHERE type_id = ? AND raw_json != '' AND raw_json IS NOT NULL",
    ).all(typeId) as Array<{ id: string }>).map(r => r.id),
  );

  const toFetch = items.filter(i => !existing.has(i.id)).slice(0, limit);
  console.log(`\n${typeName}: ${toFetch.length} op te halen (${existing.size} al aanwezig, max ${limit})`);

  let objectsSynced = 0;
  let relationsSynced = 0;

  for (let i = 0; i < toFetch.length; i++) {
    if (isAtLimit()) {
      console.log(`  ⏹ Call-limiet bereikt bij ${i}/${toFetch.length}`);
      break;
    }

    const item = toFetch[i];
    if ((i + 1) % 10 === 0) console.log(`  ${i + 1}/${toFetch.length}... (${getCallCount()}/${MAX_CALLS} calls)`);

    const detail = await fetchApi(`/api/objectitem/${item.id}`, headers) as ObjectDetail;
    const relCount = storeObjectWithRelations(db, item.id, detail, typeId, item.title);
    objectsSynced++;
    relationsSynced += relCount;

    await sleep(DELAY_MS);
  }

  return { objects: objectsSynced, relations: relationsSynced };
}

async function main(): Promise<void> {
  setCallLimit(MAX_CALLS);

  const headers = getHeaders();
  const db = initDatabase();

  const syncId = db.prepare(
    "INSERT INTO sync_runs (status) VALUES ('running') RETURNING id",
  ).get() as { id: number };

  let totalObjects = 0;
  let totalRelations = 0;

  try {
    // ── Stap 1: Lijsten ophalen (7 calls) ──
    console.log('=== STAP 1: Objectlijsten ophalen ===\n');

    const lists: Record<string, ListItem[]> = {};
    for (const [key, type] of Object.entries(OBJECT_TYPES)) {
      if (isAtLimit()) break;
      console.log(`${type.name}:`);
      upsertObjectType(db, {
        template_id: type.id, name: type.name,
        name_internal: '', count: 0, category: '',
      });
      lists[key] = await fetchObjectList(type.id, headers);
      await sleep(DELAY_MS);
    }

    console.log(`\nLijsten opgehaald: ${getCallCount()}/${MAX_CALLS} calls gebruikt`);

    // ── Stap 2: Details ophalen ──
    console.log('\n=== STAP 2: Object details ophalen ===');

    // Applicaties: alle resterende
    const appResult = await fetchAndStoreDetails(
      lists['applicatie'] ?? [], OBJECT_TYPES.applicatie.id, 'Applicaties',
      db, headers, 300,
    );
    totalObjects += appResult.objects;
    totalRelations += appResult.relations;

    // Locaties: alle
    const locResult = await fetchAndStoreDetails(
      lists['locatie'] ?? [], OBJECT_TYPES.locatie.id, 'Locaties',
      db, headers, 50,
    );
    totalObjects += locResult.objects;
    totalRelations += locResult.relations;

    // Infra: alle types, zoveel als past
    for (const infraKey of ['node', 'database', 'netwerk', 'netwerkDevice', 'apparaat'] as const) {
      if (isAtLimit()) break;
      const type = OBJECT_TYPES[infraKey];
      const result = await fetchAndStoreDetails(
        lists[infraKey] ?? [], type.id, type.name,
        db, headers, 50,
      );
      totalObjects += result.objects;
      totalRelations += result.relations;
    }

    // Done
    db.prepare(`
      UPDATE sync_runs SET finished_at = datetime('now'), status = 'completed',
        objects_synced = ?, relations_synced = ? WHERE id = ?
    `).run(totalObjects, totalRelations, syncId.id);

    // Stats
    const stats = db.prepare(`
      SELECT
        (SELECT count(*) FROM objects) as objects,
        (SELECT count(*) FROM objects WHERE is_template = 0) as real_objects,
        (SELECT count(*) FROM relationships) as relations,
        (SELECT count(*) FROM object_types) as types
    `).get() as { objects: number; real_objects: number; relations: number; types: number };

    const typeCounts = db.prepare(`
      SELECT ot.name, count(*) as n
      FROM objects o JOIN object_types ot ON o.type_id = ot.template_id
      WHERE o.is_template = 0
      GROUP BY ot.name ORDER BY n DESC
    `).all() as Array<{ name: string; n: number }>;

    console.log(`\n=== SYNC KLAAR ===`);
    console.log(`API calls: ${getCallCount()}/${MAX_CALLS}`);
    console.log(`Nieuwe objecten deze run: ${totalObjects}`);
    console.log(`Nieuwe relaties deze run: ${totalRelations}`);
    console.log(`\nTotaal in database:`);
    console.log(`  Objecten: ${stats.objects} (${stats.real_objects} echt)`);
    console.log(`  Relaties: ${stats.relations}`);
    console.log(`  Objecttypes: ${stats.types}`);
    console.log(`\nPer type:`);
    for (const tc of typeCounts) {
      console.log(`  ${tc.name}: ${tc.n}`);
    }

  } catch (err) {
    db.prepare(`
      UPDATE sync_runs SET finished_at = datetime('now'), status = 'failed',
        error_message = ?, objects_synced = ?, relations_synced = ? WHERE id = ?
    `).run(String(err), totalObjects, totalRelations, syncId.id);
    throw err;
  } finally {
    db.close();
  }
}

main().catch((err: unknown) => { console.error('Fatal:', err); process.exit(1); });
