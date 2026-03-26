import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { prioritizeMerge, buildIntentContext } from './context-builder.js';

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
    expect(result[0].title).toBe('Neuron ESB LDN');
    expect(result[1].title).toBe('Neuron ESB HR Dataservice ++ LDN');
  });

  it('should rank ESB apps above email bedrijfsobjecten', () => {
    const result = prioritizeMerge(keywordHits, semanticHits, ['esb'], 10);
    const esbAppIndex = result.findIndex(h => h.title === 'Neuron ESB LDN');
    const emailIndex = result.findIndex(h => h.title.includes('esb@'));
    expect(esbAppIndex).toBeLessThan(emailIndex);
  });

  it('should deduplicate across sources', () => {
    const dupe = [...semanticHits, { id: '2', title: 'Neuron ESB LDN', type: 'Applicatie', score: 0.65 }];
    const result = prioritizeMerge(keywordHits, dupe, ['esb'], 10);
    expect(result.filter(h => h.id === '2')).toHaveLength(1);
  });

  it('should limit results to maxHits', () => {
    const result = prioritizeMerge(keywordHits, semanticHits, ['esb'], 3);
    expect(result).toHaveLength(3);
  });

  it('should include semantic hits after system matches', () => {
    const result = prioritizeMerge(keywordHits, semanticHits, ['esb'], 10);
    expect(result.some(h => h.id === '12')).toBe(true);
  });
});

describe('buildIntentContext (integration, real DB)', () => {
  let db: Database.Database;

  beforeAll(() => {
    db = new Database('data/impact.db', { readonly: true });
  });
  afterAll(() => { db.close(); });

  it('should return context with relations for impact intent on known app', () => {
    const hits = [{ id: '58bec7b5c59ff20df8c8daa8', title: 'Neuron ESB LDN', type: 'Applicatie', score: 5 }];
    const result = buildIntentContext(db, hits, ['impact']);
    expect(result).toContain('Neuron ESB LDN');
    console.log('Impact context:\n', result);
  });

  it('should return only actors for actors intent', () => {
    const hits = [{ id: '58bec7b5c59ff20df8c8daa8', title: 'Neuron ESB LDN', type: 'Applicatie', score: 5 }];
    const result = buildIntentContext(db, hits, ['actors']);
    expect(result).not.toContain('Infrastructuur');
  });

  it('should return "(geen relevante relaties)" for object without relations', () => {
    const hits = [{ id: '6548e312707bb0c35ee2ecce', title: 'storing.moononline.nl', type: 'Bedrijfsobject', score: 0.6 }];
    const result = buildIntentContext(db, hits, ['impact']);
    expect(result).toContain('geen relevante relaties');
  });

  it('should handle empty hits array', () => {
    const result = buildIntentContext(db, [], ['general']);
    expect(result).toBe('Geen objecten gevonden in de database.');
  });

  it('should merge configs from multiple intents without duplication', () => {
    const hits = [{ id: '58bec7b5c59ff20df8c8daa8', title: 'Neuron ESB LDN', type: 'Applicatie', score: 5 }];
    const result = buildIntentContext(db, hits, ['actors', 'processes']);
    const actorCount = (result.match(/Actoren/g) ?? []).length;
    expect(actorCount).toBeLessThanOrEqual(1);
  });
});
