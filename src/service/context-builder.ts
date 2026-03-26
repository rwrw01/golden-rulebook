import type Database from 'better-sqlite3';
import type { QueryIntent } from './query-classifier.js';
import type { SearchHit } from './types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RelationConfig = {
  /** Relationship types to query (forward; bidirectional types also query reverse) */
  relTypes: string[];
  /** Target object types to include */
  objectTypes: string[];
  /** Label shown in output */
  label: string;
};

type RelatedObject = {
  id: string;
  title: string;
  type: string;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HIGH_VALUE_TYPES = new Set([
  'Applicatie',
  'Applicatieservice',
  'Bedrijfsproces',
  'Actor',
  'Node',
  'Database',
  'Netwerk',
  'Netwerk Device',
]);

/** Relationship types that are inherently bidirectional */
const BIDIRECTIONAL_REL_TYPES = new Set(['flow', 'aggregation', 'association']);

const INTENT_RELATION_CONFIGS: Record<QueryIntent, RelationConfig[]> = {
  actors: [
    { relTypes: ['usedby', 'assignment'], objectTypes: ['Actor'], label: 'Teams (te informeren)' },
    { relTypes: ['assignment'], objectTypes: ['Locatie'], label: 'Locatie' },
  ],
  processes: [
    { relTypes: ['usedby'], objectTypes: ['Bedrijfsproces'], label: 'Getroffen processen' },
    { relTypes: ['usedby', 'aggregation'], objectTypes: ['Bedrijfsfunctie'], label: 'Bedrijfsfuncties' },
  ],
  infra: [
    { relTypes: ['realization', 'access'], objectTypes: ['Node', 'Database', 'Netwerk', 'Netwerk Device', 'Apparaat'], label: 'Infrastructuur' },
    { relTypes: ['flow'], objectTypes: ['Applicatie'], label: 'Afhankelijke systemen' },
    { relTypes: ['assignment'], objectTypes: ['Locatie'], label: 'Locatie' },
  ],
  impact: [
    { relTypes: ['usedby'], objectTypes: ['Bedrijfsproces'], label: 'Getroffen processen' },
    { relTypes: ['usedby', 'aggregation'], objectTypes: ['Bedrijfsfunctie'], label: 'Bedrijfsfuncties' },
    { relTypes: ['usedby', 'assignment'], objectTypes: ['Actor'], label: 'Te informeren teams' },
    { relTypes: ['realization', 'access'], objectTypes: ['Node', 'Database', 'Netwerk', 'Netwerk Device', 'Apparaat'], label: 'Infrastructuur' },
    { relTypes: ['flow'], objectTypes: ['Applicatie'], label: 'Gekoppelde applicaties' },
    { relTypes: ['assignment'], objectTypes: ['Locatie'], label: 'Locatie' },
  ],
  communication: [
    { relTypes: ['usedby'], objectTypes: ['Bedrijfsproces'], label: 'Getroffen processen' },
    { relTypes: ['usedby', 'assignment'], objectTypes: ['Actor'], label: 'Te informeren teams' },
    { relTypes: ['assignment'], objectTypes: ['Locatie'], label: 'Locatie' },
  ],
  general: [
    { relTypes: ['usedby'], objectTypes: ['Bedrijfsproces'], label: 'Getroffen processen' },
    { relTypes: ['usedby', 'assignment'], objectTypes: ['Actor'], label: 'Teams' },
    { relTypes: ['flow'], objectTypes: ['Applicatie'], label: 'Gerelateerde applicaties' },
    { relTypes: ['realization', 'access'], objectTypes: ['Node', 'Database', 'Netwerk', 'Netwerk Device'], label: 'Infrastructuur' },
    { relTypes: ['assignment'], objectTypes: ['Locatie'], label: 'Locatie' },
  ],
};

// ---------------------------------------------------------------------------
// prioritizeMerge
// ---------------------------------------------------------------------------

/**
 * Checks if a hit's title contains a system name and hasn't been seen yet.
 * @param hit - The search hit to check
 * @param systemNames - System names to match against
 * @param seenIds - Set of already-seen IDs
 * @returns true if hit matches a system name and is unseen, false otherwise
 */
function isSystemNameMatch(hit: SearchHit, systemNames: string[], seenIds: Set<string>): boolean {
  if (seenIds.has(hit.id)) return false;
  const lower = hit.title.toLowerCase();
  return systemNames.some((name) => lower.includes(name));
}

/**
 * Returns a sort value for high-value type preference (lower = higher priority).
 */
function typeRank(type: string): number {
  return HIGH_VALUE_TYPES.has(type) ? 0 : 1;
}

/**
 * Smart merge of keyword + semantic search results into a prioritised, deduplicated list.
 * Tier 0: keyword hits whose title matches a system name (high-value types first, then score).
 * Tier 1: semantic hits (in original similarity order).
 * Tier 2: remaining keyword hits.
 * @param keywordHits - Results from keyword search
 * @param semanticHits - Results from semantic/embedding search
 * @param systemNames - Lowercased system names to match against titles
 * @param maxHits - Maximum number of results to return
 * @returns Merged, deduplicated, prioritised SearchHit array
 */
export function prioritizeMerge(
  keywordHits: SearchHit[],
  semanticHits: SearchHit[],
  systemNames: string[],
  maxHits: number,
): SearchHit[] {
  const seen = new Set<string>();

  const tier0 = keywordHits
    .filter((h) => isSystemNameMatch(h, systemNames, seen))
    .sort((a, b) => typeRank(a.type) - typeRank(b.type) || b.score - a.score);
  tier0.forEach((h) => seen.add(h.id));

  const tier1: SearchHit[] = [];
  for (const h of semanticHits) {
    if (!seen.has(h.id)) {
      tier1.push(h);
      seen.add(h.id);
    }
  }

  const tier2: SearchHit[] = [];
  for (const h of keywordHits) {
    if (!seen.has(h.id)) {
      tier2.push(h);
      seen.add(h.id);
    }
  }

  return [...tier0, ...tier1, ...tier2].slice(0, maxHits);
}

// ---------------------------------------------------------------------------
// buildIntentContext helpers
// ---------------------------------------------------------------------------

/**
 * Merges relation configs from multiple intents, deduplicating by label.
 * @param intents - Active query intents
 * @returns Deduplicated list of RelationConfig entries
 */
function mergeRelationConfigs(intents: QueryIntent[]): RelationConfig[] {
  const seen = new Set<string>();
  const result: RelationConfig[] = [];
  for (const intent of intents) {
    for (const cfg of INTENT_RELATION_CONFIGS[intent] ?? []) {
      if (!seen.has(cfg.label)) {
        seen.add(cfg.label);
        result.push(cfg);
      }
    }
  }
  return result;
}

/**
 * Queries related objects for a single hit + config entry. Handles bidirectional types.
 * @param db - Open SQLite database
 * @param hitId - Source object ID
 * @param cfg - Relation config specifying which types to query
 * @returns Deduplicated array of related objects
 */
function queryRelations(db: Database.Database, hitId: string, cfg: RelationConfig): RelatedObject[] {
  const typePlaceholders = cfg.relTypes.map(() => '?').join(', ');
  const objPlaceholders = cfg.objectTypes.map(() => '?').join(', ');

  const fwdSql = `SELECT DISTINCT o.id, o.title, ot.name as type
    FROM relationships r
    JOIN objects o ON o.id = r.target_id
    JOIN object_types ot ON o.type_id = ot.template_id
    WHERE r.source_id = ?
      AND r.relationship_type IN (${typePlaceholders})
      AND ot.name IN (${objPlaceholders})
    ORDER BY o.title LIMIT 15`;

  const fwdRows = db.prepare(fwdSql).all(hitId, ...cfg.relTypes, ...cfg.objectTypes) as RelatedObject[];
  const seen = new Set(fwdRows.map((r) => r.id));

  const biTypes = cfg.relTypes.filter((t) => BIDIRECTIONAL_REL_TYPES.has(t));
  if (biTypes.length === 0) return fwdRows;

  const biPlaceholders = biTypes.map(() => '?').join(', ');
  const revSql = `SELECT DISTINCT o.id, o.title, ot.name as type
    FROM relationships r
    JOIN objects o ON o.id = r.source_id
    JOIN object_types ot ON o.type_id = ot.template_id
    WHERE r.target_id = ?
      AND r.relationship_type IN (${biPlaceholders})
      AND ot.name IN (${objPlaceholders})
    ORDER BY o.title LIMIT 15`;

  const revRows = (db.prepare(revSql).all(hitId, ...biTypes, ...cfg.objectTypes) as RelatedObject[])
    .filter((r) => !seen.has(r.id));

  return [...fwdRows, ...revRows];
}

/**
 * Formats a single hit with its queried relations into a context string chunk.
 * @param db - Open SQLite database
 * @param hit - The search hit to describe
 * @param configs - Relation configs to query for this hit
 * @returns Formatted markdown-like string chunk
 */
function buildHitChunk(db: Database.Database, hit: SearchHit, configs: RelationConfig[]): string {
  const lines: string[] = [`### ${hit.type}: ${hit.title} [/app/${hit.id}]`];
  let hasAny = false;

  for (const cfg of configs) {
    const rows = queryRelations(db, hit.id, cfg);
    if (rows.length > 0) {
      lines.push(`${cfg.label}: ${rows.map((r) => r.title).join(', ')}`);
      hasAny = true;
    }
  }

  if (!hasAny) lines.push('(geen relevante relaties)');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// buildIntentContext
// ---------------------------------------------------------------------------

/**
 * Builds a formatted context string for the LLM from DB relations relevant to the given intents.
 * @param db - Open SQLite database (readonly)
 * @param hits - Merged search hits to look up
 * @param intents - Active query intents that determine which relation types to include
 * @returns Multi-line context string ready for LLM prompt injection
 */
export function buildIntentContext(
  db: Database.Database,
  hits: SearchHit[],
  intents: QueryIntent[],
): string {
  if (hits.length === 0) return 'Geen objecten gevonden in de database.';

  const configs = mergeRelationConfigs(intents);
  return hits.map((hit) => buildHitChunk(db, hit, configs)).join('\n\n');
}
