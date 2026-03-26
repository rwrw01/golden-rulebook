/**
 * PoC sync: extract ~50 apps + their full relation graph from BlueDolphin
 * Populates the local SQLite impact database
 */
import Database from 'better-sqlite3';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';

import { getAuthHeaders } from '../../../observer/src/cookie-extractor.js';

// ── Config ──
const OBSERVER_DB = join(import.meta.dirname!, '..', '..', '..', 'observer', 'data', 'observer.db');
const IMPACT_DB = join(import.meta.dirname!, '..', '..', 'data', 'impact.db');
const SCHEMA_SQL = join(import.meta.dirname!, 'schema.sql');
const BASE_URL = 'https://bd-presentation-api.eu.bd-cloud.app';
const AUTH_DOMAIN = 'bd-presentation-api.eu.bd-cloud.app';
const TENANT = 'leiden';
const SESSION_ID = 7;
const DELAY_MS = 800;
const POC_LIMIT = 50;

// ── Types ──
interface ListItem { id: string; title: string }
interface RelatedObject {
  object_id: string;
  object_title: string;
  object_type: { template_id: string; name: string; name_internal: string };
  relationship: { name: string; type: string };
}
interface ObjectDetail {
  title?: string;
  object_title?: string;
  related_bluedolphin_objects: RelatedObject[];
}
interface ObjectType {
  template_id: string;
  name: string;
  name_internal: string;
  count: number;
  category: string;
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

function initDatabase(): Database.Database {
  const db = new Database(IMPACT_DB);
  const schema = readFileSync(SCHEMA_SQL, 'utf-8');
  db.exec(schema);
  return db;
}

function upsertObjectType(db: Database.Database, ot: ObjectType): void {
  db.prepare(`
    INSERT INTO object_types (template_id, name, name_internal, category)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(template_id) DO UPDATE SET name=excluded.name, name_internal=excluded.name_internal, category=excluded.category
  `).run(ot.template_id, ot.name, ot.name_internal, ot.category);
}

function upsertObject(db: Database.Database, id: string, title: string, typeId: string, rawJson: string): void {
  const safeTitle = title ?? '(unknown)';
  const isTemplate = safeTitle.startsWith('(c)') ? 1 : 0;
  db.prepare(`
    INSERT INTO objects (id, title, type_id, is_template, synced_at, raw_json)
    VALUES (?, ?, ?, ?, datetime('now'), ?)
    ON CONFLICT(id) DO UPDATE SET title=excluded.title, synced_at=excluded.synced_at, raw_json=excluded.raw_json
  `).run(id, safeTitle, typeId, isTemplate, rawJson);
}

function upsertRelationship(db: Database.Database, sourceId: string, targetId: string, relType: string, relName: string): void {
  db.prepare(`
    INSERT INTO relationships (source_id, target_id, relationship_type, relationship_name, synced_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(source_id, target_id, relationship_type) DO UPDATE SET relationship_name=excluded.relationship_name, synced_at=excluded.synced_at
  `).run(sourceId, targetId, relType, relName);
}

async function main(): Promise<void> {
  // Auth
  const obsDb = new Database(OBSERVER_DB, { readonly: true });
  const authHeaders = getAuthHeaders(obsDb, SESSION_ID, AUTH_DOMAIN);
  obsDb.close();
  if (!authHeaders) { console.error('No auth headers'); process.exit(1); }

  const headers: Record<string, string> = {
    ...authHeaders,
    'Accept': 'application/json',
    'tenant': TENANT,
  };

  // Init impact DB
  const db = initDatabase();
  const syncId = db.prepare(
    `INSERT INTO sync_runs (status) VALUES ('running') RETURNING id`,
  ).get() as { id: number };

  let objectsSynced = 0;
  let relationsSynced = 0;

  try {
    // Step 1: Seed known object types from relation-model.json (skip /api/objectlist/all)
    console.log('Stap 1: Objecttypes laden uit relation-model.json...');
    const modelPath = join(import.meta.dirname!, '..', '..', 'data', 'relation-model.json');
    const model = JSON.parse(readFileSync(modelPath, 'utf-8')) as {
      object_types: Array<{ template_id: string; name: string; count: number }>;
    };
    for (const ot of model.object_types) {
      upsertObjectType(db, { template_id: ot.template_id, name: ot.name, name_internal: '', count: ot.count, category: '' });
    }
    console.log(`  ${model.object_types.length} objecttypes`);

    // Step 2: Fetch first 50 real apps
    const APP_TEMPLATE = '532fffd0b41281c17ce263b9';
    console.log(`\nStap 2: Eerste ${POC_LIMIT} applicaties ophalen...`);

    const appList = await fetchApi(
      `/api/objectlist/${APP_TEMPLATE}?start=-1&take=${POC_LIMIT + 10}&is_archived=false`, headers,
    ) as { items: ListItem[] };
    const apps = appList.items.filter(a => !a.title.startsWith('(c)')).slice(0, POC_LIMIT);
    console.log(`  ${apps.length} applicaties geselecteerd`);
    await sleep(DELAY_MS);

    // Step 3: Per app, fetch detail + store object + relations
    console.log('\nStap 3: Details + relaties ophalen...');
    const discoveredObjects = new Set<string>();

    for (let i = 0; i < apps.length; i++) {
      const app = apps[i];
      if ((i + 1) % 10 === 0) console.log(`  ${i + 1}/${apps.length}...`);

      const detail = await fetchApi(`/api/objectitem/${app.id}`, headers) as ObjectDetail;
      upsertObject(db, app.id, detail.object_title ?? detail.title ?? app.title, APP_TEMPLATE, JSON.stringify(detail));
      objectsSynced++;

      // Store related objects + relationships
      for (const rel of detail.related_bluedolphin_objects) {
        // Ensure related object type exists
        upsertObjectType(db, {
          template_id: rel.object_type.template_id,
          name: rel.object_type.name,
          name_internal: rel.object_type.name_internal ?? '',
          count: 0,
          category: '',
        });

        // Store related object (stub — will be enriched if we fetch its detail later)
        upsertObject(db, rel.object_id, rel.object_title, rel.object_type.template_id, '');
        discoveredObjects.add(rel.object_id);

        // Store relationship
        upsertRelationship(db, app.id, rel.object_id, rel.relationship.type, rel.relationship.name);
        relationsSynced++;
      }

      await sleep(DELAY_MS);
    }

    // Step 4: Fetch detail for discovered processes, functions, actors (1 level deep)
    const relevantTypes = new Set([
      '531721d799ffecf9b5c8b1ad', // Bedrijfsproces
      '5852ada13bf3ff08c475d1fd', // Bedrijfsfunctie
      '532ff9dbb41281c17ce263b2', // Actor
      '5ebd0aebc572da66245eca13', // Bedrijfsservice
    ]);

    const toEnrich = db.prepare(`
      SELECT id, type_id FROM objects
      WHERE raw_json = '' AND type_id IN (${[...relevantTypes].map(() => '?').join(',')})
    `).all(...relevantTypes) as Array<{ id: string; type_id: string }>;

    console.log(`\nStap 4: ${toEnrich.length} gerelateerde objecten verrijken...`);

    for (let i = 0; i < toEnrich.length; i++) {
      const obj = toEnrich[i];
      if ((i + 1) % 10 === 0) console.log(`  ${i + 1}/${toEnrich.length}...`);

      const detail = await fetchApi(`/api/objectitem/${obj.id}`, headers) as ObjectDetail;
      upsertObject(db, obj.id, detail.object_title ?? detail.title ?? '(unknown)', obj.type_id, JSON.stringify(detail));
      objectsSynced++;

      for (const rel of detail.related_bluedolphin_objects) {
        upsertObjectType(db, {
          template_id: rel.object_type.template_id,
          name: rel.object_type.name,
          name_internal: rel.object_type.name_internal ?? '',
          count: 0,
          category: '',
        });
        upsertObject(db, rel.object_id, rel.object_title, rel.object_type.template_id, '');
        upsertRelationship(db, obj.id, rel.object_id, rel.relationship.type, rel.relationship.name);
        relationsSynced++;
      }

      await sleep(DELAY_MS);
    }

    // Done
    db.prepare(`
      UPDATE sync_runs SET finished_at = datetime('now'), status = 'completed',
        objects_synced = ?, relations_synced = ? WHERE id = ?
    `).run(objectsSynced, relationsSynced, syncId.id);

    // Stats
    const stats = db.prepare(`
      SELECT
        (SELECT count(*) FROM objects) as objects,
        (SELECT count(*) FROM objects WHERE is_template = 0) as real_objects,
        (SELECT count(*) FROM relationships) as relations,
        (SELECT count(*) FROM object_types) as types
    `).get() as { objects: number; real_objects: number; relations: number; types: number };

    console.log(`\n=== SYNC KLAAR ===`);
    console.log(`Objecten: ${stats.objects} (${stats.real_objects} echt)`);
    console.log(`Relaties: ${stats.relations}`);
    console.log(`Objecttypes: ${stats.types}`);

    // Impact chain test
    const chainTest = db.prepare(`SELECT count(*) as n FROM v_impact_chain`).get() as { n: number };
    console.log(`Impactketens (app→proces→functie→actor): ${chainTest.n}`);

    console.log(`\nDatabase: ${IMPACT_DB}`);

  } catch (err) {
    db.prepare(`
      UPDATE sync_runs SET finished_at = datetime('now'), status = 'failed',
        error_message = ?, objects_synced = ?, relations_synced = ? WHERE id = ?
    `).run(String(err), objectsSynced, relationsSynced, syncId.id);
    throw err;
  } finally {
    db.close();
  }
}

main().catch((err: unknown) => { console.error('Fatal:', err); process.exit(1); });
