/**
 * Shared helpers for BlueDolphin sync scripts
 * Extracts common logic from sync-poc.ts for reuse
 */
import Database from 'better-sqlite3';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';

import { getAuthHeaders } from '../../../observer/src/cookie-extractor.js';

// ── Config ──
export const OBSERVER_DB = join(import.meta.dirname!, '..', '..', '..', 'observer', 'data', 'observer.db');
export const IMPACT_DB = join(import.meta.dirname!, '..', '..', 'data', 'impact.db');
export const SCHEMA_SQL = join(import.meta.dirname!, 'schema.sql');
export const BASE_URL = 'https://bd-presentation-api.eu.bd-cloud.app';
export const AUTH_DOMAIN = 'bd-presentation-api.eu.bd-cloud.app';
export const TENANT = 'leiden';
export const SESSION_ID = 12;
export const DELAY_MS = 800;

// ── Types ──
export interface ListItem { id: string; title: string }
export interface RelatedObject {
  object_id: string;
  object_title: string;
  object_type: { template_id: string; name: string; name_internal: string };
  relationship: { name: string; type: string };
}
export interface ObjectDetail {
  title?: string;
  object_title?: string;
  related_bluedolphin_objects: RelatedObject[];
}
export interface ObjectType {
  template_id: string;
  name: string;
  name_internal: string;
  count: number;
  category: string;
}

// ── Call counter ──
let callCount = 0;
let callLimit = Infinity;

export function setCallLimit(limit: number): void {
  callLimit = limit;
}

export function getCallCount(): number {
  return callCount;
}

export function resetCallCount(): void {
  callCount = 0;
}

export function isAtLimit(): boolean {
  return callCount >= callLimit;
}

// ── Utilities ──
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchApi(path: string, headers: Record<string, string>): Promise<unknown> {
  if (callCount >= callLimit) {
    throw new Error(`Call limit reached (${callLimit})`);
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${BASE_URL}${path}`, { headers });
      callCount++;
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

// ── Auth ──
export function getHeaders(): Record<string, string> {
  const obsDb = new Database(OBSERVER_DB, { readonly: true });
  const authHeaders = getAuthHeaders(obsDb, SESSION_ID, AUTH_DOMAIN);
  obsDb.close();
  if (!authHeaders) {
    console.error('No auth headers — login via observer first');
    process.exit(1);
  }
  return {
    ...authHeaders,
    'Accept': 'application/json',
    'tenant': TENANT,
  };
}

// ── Database ──
export function initDatabase(): Database.Database {
  const db = new Database(IMPACT_DB);
  const schema = readFileSync(SCHEMA_SQL, 'utf-8');
  db.exec(schema);
  return db;
}

export function upsertObjectType(db: Database.Database, ot: ObjectType): void {
  db.prepare(`
    INSERT INTO object_types (template_id, name, name_internal, category)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(template_id) DO UPDATE SET name=excluded.name, name_internal=excluded.name_internal, category=excluded.category
  `).run(ot.template_id, ot.name, ot.name_internal, ot.category);
}

export function upsertObject(db: Database.Database, id: string, title: string, typeId: string, rawJson: string): void {
  const safeTitle = title ?? '(unknown)';
  const isTemplate = safeTitle.startsWith('(c)') ? 1 : 0;
  db.prepare(`
    INSERT INTO objects (id, title, type_id, is_template, synced_at, raw_json)
    VALUES (?, ?, ?, ?, datetime('now'), ?)
    ON CONFLICT(id) DO UPDATE SET
      title=excluded.title,
      synced_at=excluded.synced_at,
      raw_json = CASE WHEN length(excluded.raw_json) > length(COALESCE(objects.raw_json, '')) THEN excluded.raw_json ELSE objects.raw_json END
  `).run(id, safeTitle, typeId, isTemplate, rawJson);
}

export function upsertRelationship(db: Database.Database, sourceId: string, targetId: string, relType: string, relName: string): void {
  db.prepare(`
    INSERT INTO relationships (source_id, target_id, relationship_type, relationship_name, synced_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(source_id, target_id, relationship_type) DO UPDATE SET relationship_name=excluded.relationship_name, synced_at=excluded.synced_at
  `).run(sourceId, targetId, relType, relName);
}

export function storeObjectWithRelations(
  db: Database.Database,
  objectId: string,
  detail: ObjectDetail,
  typeId: string,
  title: string,
): number {
  upsertObject(db, objectId, detail.object_title ?? detail.title ?? title, typeId, JSON.stringify(detail));

  let relCount = 0;
  for (const rel of detail.related_bluedolphin_objects) {
    upsertObjectType(db, {
      template_id: rel.object_type.template_id,
      name: rel.object_type.name,
      name_internal: rel.object_type.name_internal ?? '',
      count: 0,
      category: '',
    });
    upsertObject(db, rel.object_id, rel.object_title, rel.object_type.template_id, '');
    upsertRelationship(db, objectId, rel.object_id, rel.relationship.type, rel.relationship.name);
    relCount++;
  }
  return relCount;
}
