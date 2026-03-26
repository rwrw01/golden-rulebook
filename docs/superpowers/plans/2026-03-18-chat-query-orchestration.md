# Chat Query Orchestration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the naive merge logic in chat.ts with an orchestrated pipeline that (1) gives exact keyword matches priority over semantic hits, and (2) classifies the user's question to fetch only the relevant relation types (actors, processes, infra) from the database.

**Architecture:** Extract the monolithic `handleChat` into three focused modules: a query classifier that detects question intent, a smart merge function that prioritizes exact system name matches, and a context builder that fetches only the relation types relevant to the classified intent. The LLM streaming and system prompt remain in chat.ts.

**Tech Stack:** TypeScript, better-sqlite3, vitest (new devDep), existing embedding-service.ts

**Verified DB values:** `object_types.name` exact values confirmed: `Actor`, `Applicatie`, `Bedrijfsproces`, `Bedrijfsfunctie`, `Database`, `Locatie`, `Netwerk`, `Netwerk Device`, `Netwerk (oud)`, `Node`, `Apparaat`, `Server/Node (oud)`, `Applicatieservice`, `Bedrijfsobject`.

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `src/service/types.ts` | Shared `SearchHit` interface |
| Create | `src/service/query-classifier.ts` | Classify user question into intent + extract system names |
| Create | `src/service/context-builder.ts` | Build LLM context: prioritized merge + intent-filtered relations |
| Modify | `src/ui/chat.ts` | Wire classifier + context-builder, remove inline search/merge logic |
| Create | `src/service/query-classifier.test.ts` | Unit tests for classifier |
| Create | `src/service/context-builder.test.ts` | Unit + integration tests for context builder |

---

### Task 0: Setup — vitest + shared types

**Files:**
- Modify: `package.json`
- Create: `src/service/types.ts`

- [ ] **Step 1: Install vitest**

Run: `npm install --save-dev vitest --save-exact`

- [ ] **Step 2: Add test script to package.json**

Add to `"scripts"`: `"test": "vitest run"`

- [ ] **Step 3: Create shared SearchHit interface**

```typescript
// src/service/types.ts
export interface SearchHit {
  id: string;
  title: string;
  type: string;
  score: number;
}
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/service/types.ts
git commit -m "Add vitest and shared SearchHit type"
```

---

### Task 1: Query Classifier

**Files:**
- Create: `src/service/query-classifier.ts`
- Create: `src/service/query-classifier.test.ts`

The classifier detects two things from a user question:
1. **Intent**: what type of answer the user wants (actors, processes, infra, impact, or general)
2. **System names**: explicit system/app names mentioned (e.g. "ESB", "Allegro")

Intent determines which relation types to fetch. System names determine keyword search priority.

- [ ] **Step 1: Write the failing test**

```typescript
// src/service/query-classifier.test.ts
import { describe, it, expect } from 'vitest';
import { classifyQuery } from './query-classifier.js';

describe('classifyQuery', () => {
  it('should detect actor intent from "wie moet ik informeren"', () => {
    const result = classifyQuery('Wie moet ik informeren bij een ESB storing?');
    expect(result.intents).toContain('actors');
    expect(result.systemNames).toContain('esb');
  });

  it('should detect process intent from "welke processen"', () => {
    const result = classifyQuery('Welke processen raakt een storing in Allegro?');
    expect(result.intents).toContain('processes');
    expect(result.systemNames).toContain('allegro');
  });

  it('should detect infra intent from "waar draait dit op"', () => {
    const result = classifyQuery('Waar draait de ESB op? Welke servers?');
    expect(result.intents).toContain('infra');
    expect(result.systemNames).toContain('esb');
  });

  it('should detect impact intent from "wat is de impact"', () => {
    const result = classifyQuery('Wat is de impact als Allegro uitvalt?');
    expect(result.intents).toContain('impact');
    expect(result.systemNames).toContain('allegro');
  });

  it('should detect multiple intents from compound questions', () => {
    const result = classifyQuery('ESB storing: wie informeren en welke processen geraakt?');
    expect(result.intents).toContain('actors');
    expect(result.intents).toContain('processes');
    expect(result.systemNames).toContain('esb');
  });

  it('should default to general for unclassifiable questions', () => {
    const result = classifyQuery('Hoeveel applicaties hebben we?');
    expect(result.intents).toContain('general');
    expect(result.systemNames).toHaveLength(0);
  });

  it('should extract multi-word system names', () => {
    const result = classifyQuery('Storing in Neuron ESB, wie bellen?');
    expect(result.systemNames).toContain('neuron esb');
    expect(result.intents).toContain('actors');
  });

  it('should detect intranet/communication intent', () => {
    const result = classifyQuery('Kan je een bericht voor intranet maken over de ESB storing?');
    expect(result.intents).toContain('communication');
    expect(result.systemNames).toContain('esb');
  });

  it('should handle combined question: storing + intranet + informeren', () => {
    const result = classifyQuery(
      'Ik heb een storing in de ESB. waar moet ik kijken en kan je een bericht voor intranet voor de gebruikers maken?'
    );
    expect(result.intents).toContain('impact');
    expect(result.intents).toContain('communication');
    expect(result.systemNames).toContain('esb');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/service/query-classifier.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// src/service/query-classifier.ts

/**
 * Classify a user question into intents and extract system names.
 * Intent determines which relation types to fetch from the database.
 * System names determine keyword search priority.
 */

export type QueryIntent = 'actors' | 'processes' | 'infra' | 'impact' | 'communication' | 'general';

export interface QueryClassification {
  intents: QueryIntent[];
  systemNames: string[];
}

// Intent patterns: [regex, intent]
// Order matters — checked top to bottom, multiple can match
const INTENT_PATTERNS: Array<[RegExp, QueryIntent]> = [
  // Actor intent: who to contact/inform
  [/wie\s+(moet|moeten|kan|kunnen|bel|informer|waarschuw|notify)/i, 'actors'],
  [/informer|waarschuw|bel(len)?|contactperson|contactpersoon|aanspreken/i, 'actors'],
  [/te informeren|op de hoogte/i, 'actors'],

  // Process intent: which processes are affected
  [/welke?\s+(processen|bedrijfsproces|werkproces)/i, 'processes'],
  [/processen?\s+(geraakt|getroffen|verstoord|stil|plat)/i, 'processes'],
  [/(raakt|treft|verstoort).*(proces)/i, 'processes'],

  // Infra intent: servers, nodes, databases, networks
  [/(waar|welke?)\s+(draai|server|node|database|netwerk|infra)/i, 'infra'],
  [/server|node|database|infra|netwerk|hardware|host/i, 'infra'],
  [/waar\s+moet\s+ik\s+kijken/i, 'infra'],

  // Impact intent: what is affected, general impact
  [/(wat|hoe)\s+(is|groot|erg).*(impact|gevolg|effect)/i, 'impact'],
  [/impact|uitval|storing|uitvalt|plat|down|stuk|kapot|defect/i, 'impact'],

  // Communication intent: write a message, notification
  [/bericht|melding|mailing|intranet|communicat|notificat|mail|schrijf/i, 'communication'],
  [/bericht.*(intranet|gebruiker|medewerker)/i, 'communication'],
  [/storingsmelding/i, 'communication'],
];

// Dutch stop words that are never system names
const STOP_WORDS = new Set([
  // Dutch articles, prepositions, pronouns
  'een', 'het', 'van', 'met', 'bij', 'heb', 'ik', 'in', 'de', 'is', 'er',
  'dat', 'die', 'voor', 'naar', 'aan', 'uit', 'op', 'om', 'als', 'dan',
  'maar', 'wat', 'wie', 'waar', 'hoe', 'wel', 'niet', 'nog', 'ook', 'kan',
  'kun', 'moet', 'mag', 'wil', 'zal', 'zou', 'deze', 'dit', 'over',
  // Dutch verbs (common in questions)
  'hebben', 'zijn', 'worden', 'maken', 'kijken', 'moeten', 'informeren',
  // Dutch question starters (would match capsPattern at sentence start)
  'hoeveel', 'waarom', 'wanneer', 'waarmee', 'waarin', 'waaruit',
  // Domain terms (not system names)
  'bericht', 'intranet', 'gebruikers', 'storing', 'systeem', 'applicatie',
  'server', 'processen', 'welke', 'impact', 'geraakt',
]);

// Known multi-word system names (lowercased)
// These get priority matching before single-word extraction
const KNOWN_SYSTEMS: string[] = [
  'neuron esb',
  'civision berichtenmodule',
  'mijn overheid',
  'book and park',
];

export function classifyQuery(query: string): QueryClassification {
  const intents: Set<QueryIntent> = new Set();

  // Match intents
  for (const [pattern, intent] of INTENT_PATTERNS) {
    if (pattern.test(query)) {
      intents.add(intent);
    }
  }

  // Default to general if no intents matched
  if (intents.size === 0) {
    intents.add('general');
  }

  // Extract system names
  const systemNames = extractSystemNames(query);

  return {
    intents: [...intents],
    systemNames,
  };
}

function extractSystemNames(query: string): string[] {
  const lower = query.toLowerCase();
  const names: string[] = [];

  // Check known multi-word systems first
  for (const system of KNOWN_SYSTEMS) {
    if (lower.includes(system)) {
      names.push(system);
    }
  }

  // Extract capitalized words/acronyms that aren't stop words
  // Pattern: uppercase words (ESB, Allegro) or words after "in de/het/een"
  const capsPattern = /\b([A-Z][A-Za-z0-9]{1,}(?:\s+[A-Z][A-Za-z0-9]*)*)\b/g;
  let match;
  while ((match = capsPattern.exec(query)) !== null) {
    const word = match[1].toLowerCase();
    if (!STOP_WORDS.has(word) && !names.includes(word)) {
      // Skip if it's part of an already-found multi-word name
      const isPartOfKnown = names.some(n => n.includes(word) || word.includes(n));
      if (!isPartOfKnown) {
        names.push(word);
      }
    }
  }

  // Also check for all-caps acronyms (ESB, WOZ, BRP)
  const acronymPattern = /\b([A-Z]{2,})\b/g;
  while ((match = acronymPattern.exec(query)) !== null) {
    const word = match[1].toLowerCase();
    if (!STOP_WORDS.has(word) && !names.includes(word)) {
      const isPartOfKnown = names.some(n => n.includes(word));
      if (!isPartOfKnown) {
        names.push(word);
      }
    }
  }

  return names;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/service/query-classifier.test.ts`
Expected: All 9 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/service/query-classifier.ts src/service/query-classifier.test.ts
git commit -m "Add query classifier: detect intents and system names from user questions"
```

---

### Task 2: Context Builder

**Files:**
- Create: `src/service/context-builder.ts`
- Create: `src/service/context-builder.test.ts`

The context builder does two things:
1. **Smart merge**: keyword hits where title matches a detected system name get boosted to the top, before semantic hits
2. **Intent-filtered enrichment**: only fetch relation types that match the classified intent

- [ ] **Step 1: Write the failing test for prioritized merge**

```typescript
// src/service/context-builder.test.ts
import { describe, it, expect } from 'vitest';
import { prioritizeMerge } from './context-builder.js';

describe('prioritizeMerge', () => {
  const keywordHits = [
    { id: '1', title: 'Waarstaatjegemeente.nl', type: 'Applicatie', score: 1 },
    { id: '2', title: 'Neuron ESB LDN', type: 'Applicatie', score: 5 },
    { id: '3', title: 'Neuron ESB HR Dataservice ++ LDN', type: 'Applicatie', score: 3 },
    { id: '4', title: '(MB) esb@servicepunt71.nl', type: 'Bedrijfsobject', score: 1 },
  ];

  const semanticHits = [
    { id: '10', title: 'storing.moononline.nl/gemeenteleiderdorp', type: 'Bedrijfsobject', score: 0.689 },
    { id: '11', title: 'intranet.zoeterwoude.nl', type: 'Bedrijfsobject', score: 0.670 },
    { id: '12', title: 'Routeren van procesoutput naar berichtenbox', type: 'Applicatieservice', score: 0.669 },
  ];

  it('should put exact system name matches first', () => {
    const result = prioritizeMerge(keywordHits, semanticHits, ['esb'], 10);
    // Neuron ESB LDN and Neuron ESB HR should be first
    expect(result[0].title).toBe('Neuron ESB LDN');
    expect(result[1].title).toBe('Neuron ESB HR Dataservice ++ LDN');
  });

  it('should not include low-relevance keyword matches like email addresses', () => {
    const result = prioritizeMerge(keywordHits, semanticHits, ['esb'], 10);
    // Email bedrijfsobjecten should rank lower than app matches
    const esbAppIndex = result.findIndex(h => h.title === 'Neuron ESB LDN');
    const emailIndex = result.findIndex(h => h.title.includes('esb@'));
    expect(esbAppIndex).toBeLessThan(emailIndex);
  });

  it('should deduplicate across sources', () => {
    const dupe = [...semanticHits, { id: '2', title: 'Neuron ESB LDN', type: 'Applicatie', score: 0.65 }];
    const result = prioritizeMerge(keywordHits, dupe, ['esb'], 10);
    const esbCount = result.filter(h => h.id === '2').length;
    expect(esbCount).toBe(1);
  });

  it('should limit results to maxHits', () => {
    const result = prioritizeMerge(keywordHits, semanticHits, ['esb'], 3);
    expect(result).toHaveLength(3);
  });

  it('should include semantic hits after system matches', () => {
    const result = prioritizeMerge(keywordHits, semanticHits, ['esb'], 10);
    // After ESB matches, semantic hits should appear
    const hasSemanticHit = result.some(h => h.id === '12');
    expect(hasSemanticHit).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/service/context-builder.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write prioritizeMerge implementation**

```typescript
// src/service/context-builder.ts

/**
 * Context builder: smart merge + intent-filtered relation enrichment
 */
import type Database from 'better-sqlite3';
import type { QueryIntent } from './query-classifier.js';
import type { SearchHit } from './types.js';

// Types that are high-value for incident analysis (prioritized in merge)
const HIGH_VALUE_TYPES = new Set([
  'Applicatie', 'Applicatieservice', 'Bedrijfsproces', 'Actor',
  'Node', 'Database', 'Netwerk', 'Netwerk Device',
]);

/**
 * Smart merge: system name keyword matches first, then semantic, then remaining keyword.
 * Within each tier, high-value types (Applicatie, Node, etc.) rank above Bedrijfsobjecten.
 */
export function prioritizeMerge(
  keywordHits: SearchHit[],
  semanticHits: SearchHit[],
  systemNames: string[],
  maxHits: number,
): SearchHit[] {
  const seen = new Set<string>();
  const result: SearchHit[] = [];

  function add(hit: SearchHit): boolean {
    if (seen.has(hit.id)) return false;
    seen.add(hit.id);
    result.push(hit);
    return true;
  }

  // Tier 1: keyword hits whose title matches a detected system name
  // Sort: high-value types first, then by keyword score
  const systemMatches = keywordHits
    .filter(h => systemNames.some(name => h.title.toLowerCase().includes(name)))
    .sort((a, b) => {
      const aHigh = HIGH_VALUE_TYPES.has(a.type) ? 1 : 0;
      const bHigh = HIGH_VALUE_TYPES.has(b.type) ? 1 : 0;
      if (bHigh !== aHigh) return bHigh - aHigh;
      return b.score - a.score;
    });
  for (const hit of systemMatches) {
    if (result.length >= maxHits) break;
    add(hit);
  }

  // Tier 2: semantic hits (already ranked by embedding similarity)
  for (const hit of semanticHits) {
    if (result.length >= maxHits) break;
    add({ id: hit.id, title: hit.title, type: hit.type, score: hit.score });
  }

  // Tier 3: remaining keyword hits (non-system-name matches)
  const remaining = keywordHits
    .sort((a, b) => {
      const aHigh = HIGH_VALUE_TYPES.has(a.type) ? 1 : 0;
      const bHigh = HIGH_VALUE_TYPES.has(b.type) ? 1 : 0;
      if (bHigh !== aHigh) return bHigh - aHigh;
      return b.score - a.score;
    });
  for (const hit of remaining) {
    if (result.length >= maxHits) break;
    add(hit);
  }

  return result;
}

// Map intent to which relation types and object types to fetch
const INTENT_RELATION_MAP: Record<QueryIntent, {
  relationTypes: string[];
  targetTypes: string[];
  label: string;
}[]> = {
  actors: [
    { relationTypes: ['usedby', 'assignment'], targetTypes: ['Actor'], label: 'Actoren (te informeren)' },
    { relationTypes: ['assignment'], targetTypes: ['Locatie'], label: 'Locatie' },
  ],
  processes: [
    { relationTypes: ['usedby'], targetTypes: ['Bedrijfsproces'], label: 'Bedrijfsprocessen' },
    { relationTypes: ['usedby', 'aggregation'], targetTypes: ['Bedrijfsfunctie'], label: 'Bedrijfsfuncties' },
  ],
  infra: [
    { relationTypes: ['realization', 'access'], targetTypes: ['Node', 'Database', 'Netwerk', 'Netwerk Device', 'Apparaat'], label: 'Infrastructuur' },
    { relationTypes: ['flow'], targetTypes: ['Applicatie'], label: 'Afhankelijke systemen' },
    { relationTypes: ['assignment'], targetTypes: ['Locatie'], label: 'Locatie' },
  ],
  impact: [
    { relationTypes: ['usedby'], targetTypes: ['Bedrijfsproces'], label: 'Getroffen processen' },
    { relationTypes: ['usedby', 'assignment'], targetTypes: ['Actor'], label: 'Te informeren actoren' },
    { relationTypes: ['flow'], targetTypes: ['Applicatie'], label: 'Afhankelijke systemen' },
    { relationTypes: ['realization', 'access'], targetTypes: ['Node', 'Database', 'Netwerk', 'Netwerk Device'], label: 'Infrastructuur' },
    { relationTypes: ['assignment'], targetTypes: ['Locatie'], label: 'Locatie' },
  ],
  communication: [
    { relationTypes: ['usedby'], targetTypes: ['Bedrijfsproces'], label: 'Getroffen processen' },
    { relationTypes: ['usedby', 'assignment'], targetTypes: ['Actor'], label: 'Te informeren actoren' },
    { relationTypes: ['assignment'], targetTypes: ['Locatie'], label: 'Locatie' },
  ],
  general: [
    { relationTypes: ['usedby'], targetTypes: ['Bedrijfsproces'], label: 'Bedrijfsprocessen' },
    { relationTypes: ['usedby', 'assignment'], targetTypes: ['Actor'], label: 'Actoren' },
    { relationTypes: ['flow'], targetTypes: ['Applicatie'], label: 'Gerelateerde applicaties' },
    { relationTypes: ['realization', 'access'], targetTypes: ['Node', 'Database', 'Netwerk', 'Netwerk Device'], label: 'Infrastructuur' },
    { relationTypes: ['assignment'], targetTypes: ['Locatie'], label: 'Locatie' },
  ],
};

/**
 * Build enriched context chunks filtered by intent.
 * Only fetches relation types relevant to the user's question.
 */
export function buildIntentContext(
  db: Database.Database,
  hits: SearchHit[],
  intents: QueryIntent[],
): string {
  if (hits.length === 0) return 'Geen objecten gevonden in de database.';

  const relationConfigs = mergeRelationConfigs(intents);
  const chunks = hits.map(hit => buildHitChunk(db, hit, relationConfigs));
  return chunks.join('\n\n');
}

/** Build context chunk for a single hit with its intent-filtered relations. */
function buildHitChunk(
  db: Database.Database,
  hit: SearchHit,
  configs: RelationConfig[],
): string {
  const lines: string[] = [`### ${hit.type}: ${hit.title} [/app/${hit.id}]`];
  let hasRelations = false;

  for (const config of configs) {
    const rels = queryRelations(db, hit.id, config);
    if (rels.length > 0) {
      hasRelations = true;
      lines.push(`${config.label}: ${rels.map(r => r.title).join(', ')}`);
    }
  }

  if (!hasRelations) lines.push('(geen relevante relaties voor deze vraag)');
  return lines.join('\n');
}

interface RelatedObject { id: string; title: string; type: string }

/** Query forward + bidirectional relations for one object + config. */
function queryRelations(
  db: Database.Database,
  objectId: string,
  config: RelationConfig,
): RelatedObject[] {
  const relPlaceholders = config.relationTypes.map(() => '?').join(',');
  const typePlaceholders = config.targetTypes.map(() => '?').join(',');

  // Forward: source_id = objectId
  const forward = db.prepare(`
    SELECT DISTINCT o.id, o.title, ot.name as type
    FROM relationships r
    JOIN objects o ON o.id = r.target_id
    JOIN object_types ot ON o.type_id = ot.template_id
    WHERE r.source_id = ?
      AND r.relationship_type IN (${relPlaceholders})
      AND ot.name IN (${typePlaceholders})
    ORDER BY o.title LIMIT 15
  `).all(objectId, ...config.relationTypes, ...config.targetTypes) as RelatedObject[];

  // Reverse for bidirectional types (flow, aggregation, association)
  const bidiTypes = config.relationTypes.filter(t =>
    ['flow', 'aggregation', 'association'].includes(t),
  );
  if (bidiTypes.length === 0) return forward;

  const bidiPlaceholders = bidiTypes.map(() => '?').join(',');
  const reverse = db.prepare(`
    SELECT DISTINCT o.id, o.title, ot.name as type
    FROM relationships r
    JOIN objects o ON o.id = r.source_id
    JOIN object_types ot ON o.type_id = ot.template_id
    WHERE r.target_id = ?
      AND r.relationship_type IN (${bidiPlaceholders})
      AND ot.name IN (${typePlaceholders})
    ORDER BY o.title LIMIT 15
  `).all(objectId, ...bidiTypes, ...config.targetTypes) as RelatedObject[];

  // Deduplicate
  const seen = new Set(forward.map(r => r.id));
  return [...forward, ...reverse.filter(r => !seen.has(r.id))];
}

interface RelationConfig {
  relationTypes: string[];
  targetTypes: string[];
  label: string;
}

/** Merge relation configs from multiple intents, deduplicating by label. */
function mergeRelationConfigs(intents: QueryIntent[]): RelationConfig[] {
  const byLabel = new Map<string, { relationTypes: Set<string>; targetTypes: Set<string> }>();

  for (const intent of intents) {
    const configs = INTENT_RELATION_MAP[intent] ?? INTENT_RELATION_MAP.general;
    for (const config of configs) {
      const existing = byLabel.get(config.label);
      if (existing) {
        for (const rt of config.relationTypes) existing.relationTypes.add(rt);
        for (const tt of config.targetTypes) existing.targetTypes.add(tt);
      } else {
        byLabel.set(config.label, {
          relationTypes: new Set(config.relationTypes),
          targetTypes: new Set(config.targetTypes),
        });
      }
    }
  }

  return [...byLabel.entries()].map(([label, { relationTypes, targetTypes }]) => ({
    label,
    relationTypes: [...relationTypes],
    targetTypes: [...targetTypes],
  }));
}
```

- [ ] **Step 4: Run prioritizeMerge tests to verify they pass**

Run: `npx vitest run src/service/context-builder.test.ts`
Expected: All 5 prioritizeMerge tests PASS

- [ ] **Step 5: Add integration tests for buildIntentContext**

These tests use the actual production database (readonly) to verify SQL queries return real data.

```typescript
// Add to src/service/context-builder.test.ts

import Database from 'better-sqlite3';
import { buildIntentContext } from './context-builder.js';

describe('buildIntentContext (integration, real DB)', () => {
  let db: Database.Database;

  beforeAll(() => {
    db = new Database('data/impact.db', { readonly: true });
  });

  afterAll(() => {
    db.close();
  });

  it('should return processes and actors for impact intent on a known app', () => {
    // Neuron ESB LDN — known to have relations in the DB
    const hits = [{ id: '58bec7b5c59ff20df8c8daa8', title: 'Neuron ESB LDN', type: 'Applicatie', score: 5 }];
    const result = buildIntentContext(db, hits, ['impact']);
    expect(result).toContain('Neuron ESB LDN');
    // Should have at least one relation section (not just "(geen relevante relaties)")
    console.log('Impact context for Neuron ESB LDN:\n', result);
  });

  it('should return only actors for actors intent', () => {
    const hits = [{ id: '58bec7b5c59ff20df8c8daa8', title: 'Neuron ESB LDN', type: 'Applicatie', score: 5 }];
    const result = buildIntentContext(db, hits, ['actors']);
    // Should NOT contain infrastructure details
    expect(result).not.toContain('Infrastructuur');
    console.log('Actors context for Neuron ESB LDN:\n', result);
  });

  it('should return "(geen relevante relaties)" for a bedrijfsobject without relations', () => {
    const hits = [{ id: '6548e312707bb0c35ee2ecce', title: 'storing.moononline.nl', type: 'Bedrijfsobject', score: 0.6 }];
    const result = buildIntentContext(db, hits, ['impact']);
    expect(result).toContain('geen relevante relaties');
  });

  it('should handle empty hits array', () => {
    const result = buildIntentContext(db, [], ['general']);
    expect(result).toBe('Geen objecten gevonden in de database.');
  });

  it('should merge configs from multiple intents without duplicating sections', () => {
    const hits = [{ id: '58bec7b5c59ff20df8c8daa8', title: 'Neuron ESB LDN', type: 'Applicatie', score: 5 }];
    const result = buildIntentContext(db, hits, ['actors', 'processes']);
    // Both actor and process sections should appear, but not duplicated
    const actorCount = (result.match(/Actoren/g) ?? []).length;
    expect(actorCount).toBeLessThanOrEqual(1);
    console.log('Multi-intent context:\n', result);
  });
});
```

- [ ] **Step 6: Run all context-builder tests**

Run: `npx vitest run src/service/context-builder.test.ts`
Expected: All 10 tests PASS (5 unit + 5 integration)

- [ ] **Step 7: Commit**

```bash
git add src/service/context-builder.ts src/service/context-builder.test.ts
git commit -m "Add context builder: prioritized merge and intent-filtered enrichment"
```

---

### Task 3: Wire into chat.ts

**Files:**
- Modify: `src/ui/chat.ts:144-211` (handleChat function)

Replace the inline merge + buildEnrichedChunks with classifier + context-builder calls. Keep search functions and streaming functions untouched.

- [ ] **Step 1: Update handleChat to use classifier and context builder**

Replace the merge section (lines ~193-211) in `handleChat` with:

```typescript
// At top of file, add imports:
import { classifyQuery } from '../service/query-classifier.js';
import { prioritizeMerge, buildIntentContext } from '../service/context-builder.js';

// In handleChat, after semantic search, replace merge + enrichment:

  // Classify the question
  const classification = classifyQuery(userMessage);
  console.log('\n[CLASSIFY]:', classification.intents.join(', '), '| Systems:', classification.systemNames.join(', ') || '(none)');

  // Smart merge: system name matches first
  const allHits = prioritizeMerge(
    localResults.allHits,
    semanticHits.map(h => ({ id: h.id, title: h.title, type: h.type_name, score: h.score })),
    classification.systemNames,
    10,
  );

  console.log('\n[MERGED HITS]:');
  for (const h of allHits) {
    console.log(`  ${h.type}: ${h.title} (score: ${typeof h.score === 'number' && h.score < 1 ? h.score.toFixed(3) : h.score})`);
  }

  // Build intent-filtered context
  const contextChunks = buildIntentContext(db, allHits, classification.intents);
  console.log('\n[CONTEXT]:', contextChunks.length, 'chars, intents:', classification.intents.join('+'));
```

- [ ] **Step 2: Remove old buildEnrichedChunks function**

The `buildEnrichedChunks` function (lines 104-142) is now replaced by `buildIntentContext`. Remove it from chat.ts. The `getImpactContext` function (lines 64-102) can also be removed — it was already unused in the current flow.

- [ ] **Step 3: Remove old merge logic**

Remove the old merge block (semantic-first, then keyword) that was replaced in step 1.

- [ ] **Step 4: Run the full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 5: Manual test with Playwright**

Run: `npx tsx tests/chat-esb-test.ts`
Verify in server logs:
- `[CLASSIFY]` shows `impact, communication | Systems: esb`
- `[MERGED HITS]` shows `Neuron ESB LDN` and `Neuron ESB HR Dataservice` at top
- `[CONTEXT]` includes processes, actors, and infra for the ESB apps

- [ ] **Step 6: Commit**

```bash
git add src/ui/chat.ts
git commit -m "Wire query orchestration into chat: classifier + smart merge + intent context"
```

---

### Task 4: Clean up debug logging

**Files:**
- Modify: `src/ui/chat.ts`

- [ ] **Step 1: Replace verbose console.logs with structured single-line summaries**

Replace the multi-line debug logging with concise structured output:

```typescript
console.log(`[chat] "${userMessage.substring(0, 60)}" | intents=${classification.intents.join('+')} | systems=${classification.systemNames.join(',')} | hits=${allHits.length} | context=${contextChunks.length}chars | provider=${LLM_PROVIDER}`);
```

- [ ] **Step 2: Verify server output is clean**

Run: `npm run dev`, send a test question, verify log is one readable line.

- [ ] **Step 3: Commit**

```bash
git add src/ui/chat.ts
git commit -m "Clean up chat logging to structured single-line format"
```

---

## Expected outcome with the ESB test question

**Before (current):**
```
[MERGED HITS]:
  1. Bedrijfsobject: storing.moononline.nl/gemeenteleiderdorp (0.689)  <-- irrelevant
  2. Bedrijfsobject: intranet.zoeterwoude.nl (0.670)                   <-- irrelevant
  ...ESB apps buried at position 13+
```

**After (new):**
```
[CLASSIFY]: impact, communication | Systems: esb
[MERGED HITS]:
  1. Applicatie: Neuron ESB LDN (score: 5)                            <-- exact match, boosted
  2. Applicatie: Neuron ESB HR Dataservice ++ LDN (score: 3)          <-- exact match, boosted
  3. Applicatieservice: Routeren van procesoutput... (0.669)           <-- semantic
  ...
[CONTEXT]: includes processes, actors, infra for Neuron ESB
```

The LLM now receives the right objects with the right relations, producing an accurate incident report.
