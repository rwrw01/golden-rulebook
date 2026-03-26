/**
 * Bootstrap script — embed all BlueDolphin objects with enriched text
 * Run once (missing only): npx tsx src/data/embed-bootstrap.ts
 * Re-embed all objects:     npx tsx src/data/embed-bootstrap.ts --force
 * ~2 minutes for 3700 objects
 */
import { join } from 'node:path';
import Database from 'better-sqlite3';

import { ensureEmbeddingTables, getEmbeddingCount, upsertEmbedding } from './vector-repository.js';
import { embedText } from '../service/embedding-service.js';

const DB_PATH = join(import.meta.dirname!, '..', '..', 'data', 'impact.db');
const MAX_DESCRIPTION_CHARS = 800;
const MAX_EMBED_TEXT_CHARS = 2000;
const MAX_RELATIONS = 10;

interface ObjectRow {
  id: string;
  title: string;
  type_name: string;
  raw_json: string | null;
}

interface RelationRow {
  title: string;
  type: string;
}

function queryRelations(db: Database.Database, objectId: string): RelationRow[] {
  const forward = db.prepare(`
    SELECT o.title, ot.name as type
    FROM relationships r
    JOIN objects o ON o.id = r.target_id
    JOIN object_types ot ON o.type_id = ot.template_id
    WHERE r.source_id = ?
    ORDER BY ot.name
    LIMIT ?
  `).all(objectId, MAX_RELATIONS) as RelationRow[];

  if (forward.length >= MAX_RELATIONS) return forward;

  const remaining = MAX_RELATIONS - forward.length;
  const reverse = db.prepare(`
    SELECT o.title, ot.name as type
    FROM relationships r
    JOIN objects o ON o.id = r.source_id
    JOIN object_types ot ON o.type_id = ot.template_id
    WHERE r.target_id = ?
    ORDER BY ot.name
    LIMIT ?
  `).all(objectId, remaining) as RelationRow[];

  return [...forward, ...reverse];
}

/** Decode base64 property value, return empty string on failure */
function decodeB64(value: string): string {
  try {
    const decoded = Buffer.from(value, 'base64').toString('utf-8');
    // Filter out binary garbage (contains replacement chars)
    if (decoded.includes('\ufffd')) return '';
    return decoded.trim();
  } catch { return ''; }
}

/**
 * Extract useful text from raw_json: object_properties (base64) + boem items.
 * The "boem" field (BlueDolphin Object Extended Model) contains rich descriptions.
 */
function extractDescription(rawJson: string | null): string {
  if (!rawJson) return '';
  try {
    const parsed = JSON.parse(rawJson) as Record<string, unknown>;
    const parts: string[] = [];

    // 1. Decode object_properties (base64 encoded values)
    const props = (parsed['object_properties'] ?? {}) as Record<string, { value?: string }>;
    for (const [, v] of Object.entries(props)) {
      if (!v?.value) continue;
      const decoded = decodeB64(v.value);
      if (decoded.length < 5 || decoded.length > 500) continue;
      if (/^[-\d.]+$/.test(decoded)) continue;
      parts.push(decoded);
    }

    // 2. Extract from boem (BlueDolphin Object Extended Model) — rich descriptions
    const boem = parsed['boem'] as Array<{ items?: Array<{ value?: string; name?: string }> }> | undefined;
    if (Array.isArray(boem)) {
      for (const section of boem) {
        if (!Array.isArray(section.items)) continue;
        for (const item of section.items) {
          if (!item.value || typeof item.value !== 'string') continue;
          const decoded = decodeB64(item.value);
          if (decoded.length < 10 || decoded.length > 1000) continue;
          if (/^[-\d.]+$/.test(decoded)) continue;
          parts.push(decoded);
        }
      }
    }

    return parts.join('. ').slice(0, MAX_DESCRIPTION_CHARS);
  } catch {
    return '';
  }
}

function buildEmbedText(
  db: Database.Database,
  objectId: string,
  typeName: string,
  title: string,
  rawJson: string | null,
): string {
  const base = `${typeName}: ${title}`;
  const parts: string[] = [base];

  const relations = queryRelations(db, objectId);
  if (relations.length > 0) {
    const relPart = relations
      .map(r => `${r.type}: ${r.title}`)
      .join(', ');
    parts.push(`Gerelateerd: ${relPart}`);
  }

  const description = extractDescription(rawJson);
  if (description) {
    parts.push(description);
  }

  return parts.join('\n').slice(0, MAX_EMBED_TEXT_CHARS);
}

async function main(): Promise<void> {
  const forceReembed = process.argv.includes('--force');

  const db = new Database(DB_PATH);
  ensureEmbeddingTables(db);

  const existing = getEmbeddingCount(db, 'object');
  console.log(`Bestaande object-embeddings: ${existing}`);

  if (forceReembed) {
    console.log('--force actief: alle bestaande embeddings worden overschreven.');
  }

  const objects = db.prepare(`
    SELECT o.id, o.title, ot.name as type_name, o.raw_json
    FROM objects o
    JOIN object_types ot ON o.type_id = ot.template_id
    WHERE o.is_template = 0 AND o.title != '(unknown)'
    ORDER BY ot.name, o.title
  `).all() as ObjectRow[];

  console.log(`Totaal objecten: ${objects.length}`);

  let toEmbed: ObjectRow[];

  if (forceReembed) {
    toEmbed = objects;
  } else {
    const embedded = db.prepare(
      "SELECT source_id FROM embeddings WHERE source_type = 'object'",
    ).all() as Array<{ source_id: string }>;
    const alreadyEmbedded = new Set(embedded.map(e => e.source_id));
    toEmbed = objects.filter(o => !alreadyEmbedded.has(o.id));
  }

  console.log(`Nog te embedden: ${toEmbed.length}`);

  if (toEmbed.length === 0) {
    console.log('Alle objecten zijn al geëmbed.');
    db.close();
    return;
  }

  const startTime = Date.now();
  let count = 0;

  for (const obj of toEmbed) {
    const text = buildEmbedText(db, obj.id, obj.type_name, obj.title, obj.raw_json);

    try {
      const vector = await embedText(text, false);
      upsertEmbedding(db, {
        sourceType: 'object',
        sourceId: obj.id,
        textInput: text,
        vector,
      });
      count++;

      if (count % 100 === 0) {
        const elapsed = (Date.now() - startTime) / 1000;
        const rate = count / elapsed;
        const remaining = (toEmbed.length - count) / rate;
        console.log(`${count}/${toEmbed.length} geëmbed (${rate.toFixed(1)}/s, ~${remaining.toFixed(0)}s resterend)`);
      }
    } catch (err) {
      console.error(`Fout bij embedden van ${obj.id} (${obj.title}): ${err}`);
    }
  }

  const totalTime = (Date.now() - startTime) / 1000;
  console.log(`\nKlaar! ${count} objecten geëmbed in ${totalTime.toFixed(1)}s`);
  console.log(`Totaal embeddings: ${getEmbeddingCount(db, 'object')}`);

  db.close();
}

main().catch(console.error);
