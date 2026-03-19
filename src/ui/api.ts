/**
 * API endpoints for the impact analysis frontend
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type Database from 'better-sqlite3';

import { GGM_DOMAINS, classifyFunction, classifyAppByTitle } from '../data/ggm-domains.js';

export function handleApiRequest(url: URL, db: Database.Database, res: ServerResponse, req?: IncomingMessage): void {
  res.setHeader('Content-Type', 'application/json');

  if (url.pathname === '/api/search') {
    const q = url.searchParams.get('q') ?? '';
    const results = searchObjects(db, q);
    res.end(JSON.stringify(results));
    return;
  }

  if (url.pathname === '/api/impact') {
    const appId = url.searchParams.get('id') ?? '';
    const impact = getImpactChain(db, appId);
    res.end(JSON.stringify(impact));
    return;
  }

  if (url.pathname === '/api/graph') {
    const objectId = url.searchParams.get('id') ?? '';
    const depth = parseInt(url.searchParams.get('depth') ?? '1', 10);
    const typesParam = url.searchParams.get('types');
    const typeFilter = typesParam ? new Set(typesParam.split(',')) : null;
    const graph = getObjectGraph(db, objectId, depth, typeFilter);
    res.end(JSON.stringify(graph));
    return;
  }

  // New SPA endpoints
  if (url.pathname === '/api/objects') {
    const type = url.searchParams.get('type') ?? '';
    const q = url.searchParams.get('q') ?? '';
    const objects = getObjectList(db, type, q);
    res.end(JSON.stringify(objects));
    return;
  }

  if (url.pathname.startsWith('/api/object/')) {
    const objectId = url.pathname.slice('/api/object/'.length);
    const result = getObjectDetail(db, objectId);
    if (!result) { res.writeHead(404); res.end(JSON.stringify({ error: 'Not found' })); return; }
    res.end(JSON.stringify(result));
    return;
  }

  if (url.pathname === '/api/infra-topology') {
    const topology = getInfraTopology(db);
    res.end(JSON.stringify(topology));
    return;
  }

  if (url.pathname === '/api/semantic-search') {
    const q = url.searchParams.get('q') ?? '';
    if (q.length < 2) { res.end(JSON.stringify({ results: [], embeddingsAvailable: false })); return; }
    handleSemanticSearch(q, db, res).catch(err => {
      res.writeHead(500);
      res.end(JSON.stringify({ error: String(err) }));
    });
    return;
  }

  if (url.pathname === '/api/embed-status') {
    let count = 0;
    let total = 0;
    try {
      const row = db.prepare("SELECT count(*) as n FROM embeddings WHERE source_type = 'object'").get() as { n: number };
      count = row.n;
    } catch { /* table doesn't exist */ }
    total = (db.prepare("SELECT count(*) as n FROM objects WHERE is_template = 0").get() as { n: number }).n;
    res.end(JSON.stringify({ embedded: count, total, ready: count > 0 }));
    return;
  }

  if (url.pathname === '/api/embed-rebuild' && req?.method === 'POST') {
    // Trigger re-embedding in background
    res.end(JSON.stringify({ status: 'started' }));
    rebuildEmbeddings(db).catch(err => console.error('Embed rebuild error:', err));
    return;
  }

  if (url.pathname === '/api/stats') {
    const stats = getDashboardStats(db);
    res.end(JSON.stringify(stats));
    return;
  }

  if (url.pathname === '/api/dashboard') {
    const view = url.searchParams.get('view') ?? 'overview';
    const result = getDashboardView(db, view);
    res.end(JSON.stringify(result));
    return;
  }

  if (url.pathname === '/api/ggm') {
    const domainId = url.searchParams.get('domain');
    const result = domainId ? getGgmDomainDetail(db, domainId) : getGgmOverview(db);
    res.end(JSON.stringify(result));
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
}

function searchObjects(db: Database.Database, query: string): unknown[] {
  if (query.length < 2) return [];
  return db.prepare(
    "SELECT o.id, o.title, ot.name as type_name FROM objects o JOIN object_types ot ON o.type_id = ot.template_id WHERE o.title LIKE ? AND o.is_template = 0 ORDER BY ot.name, o.title LIMIT 50",
  ).all('%' + query + '%');
}

interface ImpactResult {
  app: { id: string; title: string };
  locations: Array<{ id: string; title: string }>;
  processes: Array<{ id: string; title: string }>;
  functions: Array<{ id: string; title: string }>;
  actors: Array<{ id: string; title: string }>;
  dependencies: Array<{ id: string; title: string; direction: string }>;
  infrastructure: Array<{ id: string; title: string; type: string }>;
}

function getImpactChain(db: Database.Database, appId: string): ImpactResult | null {
  const app = db.prepare(
    "SELECT id, title FROM objects WHERE id = ?",
  ).get(appId) as { id: string; title: string } | undefined;
  if (!app) return null;

  // Locations
  const locations = db.prepare(
    "SELECT DISTINCT o.id, o.title FROM relationships r JOIN objects o ON o.id = r.target_id WHERE r.source_id = ? AND r.relationship_type = 'assignment' AND o.type_id = '532ffa70b41281c17ce263b5'",
  ).all(appId) as Array<{ id: string; title: string }>;

  // Processes (usedby)
  const processes = db.prepare(
    "SELECT DISTINCT o.id, o.title FROM relationships r JOIN objects o ON o.id = r.target_id WHERE r.source_id = ? AND r.relationship_type = 'usedby' AND o.type_id = '531721d799ffecf9b5c8b1ad'",
  ).all(appId) as Array<{ id: string; title: string }>;

  // Functions (via processes)
  const processIds = processes.map(p => p.id);
  let functions: Array<{ id: string; title: string }> = [];
  if (processIds.length > 0) {
    functions = db.prepare(
      "SELECT DISTINCT o.id, o.title FROM relationships r JOIN objects o ON (o.id = r.target_id OR o.id = r.source_id) WHERE (r.source_id IN (" + processIds.map(() => '?').join(',') + ") OR r.target_id IN (" + processIds.map(() => '?').join(',') + ")) AND o.type_id = '5852ada13bf3ff08c475d1fd' AND o.id NOT IN (" + processIds.map(() => '?').join(',') + ")",
    ).all(...processIds, ...processIds, ...processIds) as Array<{ id: string; title: string }>;
  }

  // Actors (via functions, or direct from app)
  const functionIds = functions.map(f => f.id);
  let actors: Array<{ id: string; title: string }> = [];

  // Direct actors from app
  const directActors = db.prepare(
    "SELECT DISTINCT o.id, o.title FROM relationships r JOIN objects o ON o.id = r.target_id WHERE r.source_id = ? AND o.type_id = '532ff9dbb41281c17ce263b2'",
  ).all(appId) as Array<{ id: string; title: string }>;
  actors.push(...directActors);

  // Actors via functions
  if (functionIds.length > 0) {
    const funcActors = db.prepare(
      "SELECT DISTINCT o.id, o.title FROM relationships r JOIN objects o ON (o.id = r.target_id OR o.id = r.source_id) WHERE (r.source_id IN (" + functionIds.map(() => '?').join(',') + ") OR r.target_id IN (" + functionIds.map(() => '?').join(',') + ")) AND o.type_id = '532ff9dbb41281c17ce263b2'",
    ).all(...functionIds, ...functionIds) as Array<{ id: string; title: string }>;
    actors.push(...funcActors);
  }

  // Deduplicate actors
  const actorMap = new Map(actors.map(a => [a.id, a]));
  actors = [...actorMap.values()];

  // Dependencies (flow relations to other apps)
  const dependencies = db.prepare(
    "SELECT o.id, o.title, 'outgoing' as direction FROM relationships r JOIN objects o ON o.id = r.target_id WHERE r.source_id = ? AND r.relationship_type = 'flow' AND o.type_id = '532fffd0b41281c17ce263b9' UNION SELECT o.id, o.title, 'incoming' as direction FROM relationships r JOIN objects o ON o.id = r.source_id WHERE r.target_id = ? AND r.relationship_type = 'flow' AND o.type_id = '532fffd0b41281c17ce263b9'",
  ).all(appId, appId) as Array<{ id: string; title: string; direction: string }>;

  // Infrastructure (nodes, packages, databases)
  const infrastructure = db.prepare(
    "SELECT DISTINCT o.id, o.title, ot.name as type FROM relationships r JOIN objects o ON o.id = r.target_id JOIN object_types ot ON o.type_id = ot.template_id WHERE r.source_id = ? AND r.relationship_type IN ('realization', 'access') AND o.type_id IN ('5faa8d3aad3fc213ecfca3a6', '5a781736bbe61e0c485f8e8a', '61b76634ad3fbd0b08644d4d')",
  ).all(appId) as Array<{ id: string; title: string; type: string }>;

  return { app, locations, processes, functions, actors, dependencies, infrastructure };
}

function getObjectList(db: Database.Database, typeFilter: string, query: string): unknown[] {
  let sql = "SELECT o.id, o.title, ot.name as type_name FROM objects o JOIN object_types ot ON o.type_id = ot.template_id WHERE o.is_template = 0";
  const params: string[] = [];

  if (typeFilter) {
    sql += " AND ot.name = ?";
    params.push(typeFilter);
  }
  if (query && query.length >= 2) {
    sql += " AND o.title LIKE ?";
    params.push('%' + query + '%');
  }

  sql += " ORDER BY ot.name, o.title LIMIT 5000";
  return db.prepare(sql).all(...params);
}

function getObjectDetail(db: Database.Database, objectId: string): { object: { id: string; title: string; type_name: string }; relations: unknown[] } | null {
  const obj = db.prepare(
    "SELECT o.id, o.title, ot.name as type_name FROM objects o JOIN object_types ot ON o.type_id = ot.template_id WHERE o.id = ?",
  ).get(objectId) as { id: string; title: string; type_name: string } | undefined;
  if (!obj) return null;

  const relations = db.prepare(
    "SELECT o.id, o.title, ot.name as type, r.relationship_name, r.relationship_type FROM relationships r JOIN objects o ON o.id = r.target_id JOIN object_types ot ON o.type_id = ot.template_id WHERE r.source_id = ? UNION ALL SELECT o.id, o.title, ot.name as type, r.relationship_name, r.relationship_type FROM relationships r JOIN objects o ON o.id = r.source_id JOIN object_types ot ON o.type_id = ot.template_id WHERE r.target_id = ? ORDER BY type, title",
  ).all(objectId, objectId);

  return { object: obj, relations };
}

function getDashboardStats(db: Database.Database): unknown {
  const stats = db.prepare(`
    SELECT
      (SELECT count(*) FROM objects WHERE is_template = 0) as objects,
      (SELECT count(*) FROM objects WHERE type_id = '532fffd0b41281c17ce263b9' AND is_template = 0) as apps,
      (SELECT count(*) FROM relationships) as relations,
      (SELECT count(*) FROM objects WHERE type_id = '531721d799ffecf9b5c8b1ad' AND is_template = 0) as processes,
      (SELECT count(*) FROM objects WHERE type_id = '532ff9dbb41281c17ce263b2' AND is_template = 0) as actors
  `).get() as Record<string, number>;

  const types = db.prepare(
    "SELECT ot.name, count(*) as n FROM objects o JOIN object_types ot ON o.type_id = ot.template_id WHERE o.is_template = 0 GROUP BY ot.name ORDER BY n DESC",
  ).all();

  return { ...stats, types };
}

// Semantic search: combines keyword LIKE search + embedding cosine similarity
async function handleSemanticSearch(query: string, db: Database.Database, res: ServerResponse): Promise<void> {
  // Always do keyword search (fast, always works)
  const keywordResults = db.prepare(
    "SELECT o.id, o.title, ot.name as type_name FROM objects o JOIN object_types ot ON o.type_id = ot.template_id WHERE o.title LIKE ? AND o.is_template = 0 ORDER BY ot.name, o.title LIMIT 20",
  ).all('%' + query + '%') as Array<{ id: string; title: string; type_name: string }>;

  // Check if embeddings exist
  let hasEmbeddings = false;
  try {
    const count = db.prepare("SELECT count(*) as n FROM embeddings WHERE source_type = 'object'").get() as { n: number };
    hasEmbeddings = count.n > 0;
  } catch { /* table doesn't exist yet */ }

  if (!hasEmbeddings) {
    // No embeddings: return keyword results only, with a hint
    res.end(JSON.stringify({
      results: keywordResults.map(r => ({ ...r, score: 1, method: 'keyword' })),
      embeddingsAvailable: false,
    }));
    return;
  }

  // Embedding search
  try {
    const { embedText, findTopK } = await import('../service/embedding-service.js');
    const { getAllEmbeddings } = await import('../data/vector-repository.js');

    const queryVector = await embedText(query, true);
    const objectEmbeddings = getAllEmbeddings(db, 'object');
    const candidates = objectEmbeddings.map(e => ({ id: e.sourceId, vector: e.vector }));
    const semanticMatches = findTopK(queryVector, candidates, 20, 0.4);

    // Look up titles for semantic matches
    const semanticResults = semanticMatches.map(m => {
      const obj = db.prepare(
        "SELECT o.id, o.title, ot.name as type_name FROM objects o JOIN object_types ot ON o.type_id = ot.template_id WHERE o.id = ?",
      ).get(m.id) as { id: string; title: string; type_name: string } | undefined;
      return obj ? { ...obj, score: m.similarity, method: 'semantic' } : null;
    }).filter(Boolean);

    // Merge: keyword results first, then semantic results that aren't already in keyword
    const seen = new Set(keywordResults.map(r => r.id));
    const merged = [
      ...keywordResults.map(r => ({ ...r, score: 1, method: 'keyword' })),
      ...semanticResults.filter(r => r && !seen.has(r.id)),
    ];

    res.end(JSON.stringify({
      results: merged.slice(0, 30),
      embeddingsAvailable: true,
    }));
  } catch (err) {
    // Embedding search failed, fall back to keyword only
    res.end(JSON.stringify({
      results: keywordResults.map(r => ({ ...r, score: 1, method: 'keyword' })),
      embeddingsAvailable: false,
      error: String(err),
    }));
  }
}

// Rebuild embeddings for all objects (runs in background)
async function rebuildEmbeddings(db: Database.Database): Promise<void> {
  console.log('Starting embedding rebuild...');
  const { ensureEmbeddingTables, upsertEmbedding } = await import('../data/vector-repository.js');
  const { embedText } = await import('../service/embedding-service.js');

  ensureEmbeddingTables(db);

  const objects = db.prepare(
    "SELECT o.id, o.title, ot.name as type_name FROM objects o JOIN object_types ot ON o.type_id = ot.template_id WHERE o.is_template = 0 AND o.title != '(unknown)' ORDER BY ot.name, o.title",
  ).all() as Array<{ id: string; title: string; type_name: string }>;

  const existing = new Set(
    (db.prepare("SELECT source_id FROM embeddings WHERE source_type = 'object'").all() as Array<{ source_id: string }>).map(e => e.source_id),
  );

  const toEmbed = objects.filter(o => !existing.has(o.id));
  console.log(`Embedding ${toEmbed.length} new objects (${existing.size} already done)`);

  let count = 0;
  for (const obj of toEmbed) {
    try {
      const text = `${obj.type_name}: ${obj.title}`;
      const vector = await embedText(text, false);
      upsertEmbedding(db, { sourceType: 'object', sourceId: obj.id, textInput: text, vector });
      count++;
      if (count % 100 === 0) console.log(`  ${count}/${toEmbed.length} embedded`);
    } catch (err) {
      console.error(`  Error embedding ${obj.title}: ${err}`);
    }
  }
  console.log(`Embedding rebuild complete: ${count} new embeddings`);
}

// Infrastructure topology: networks, devices, their connections and containment
function getInfraTopology(db: Database.Database): unknown {
  // All networks
  const networks = db.prepare(
    "SELECT o.id, o.title FROM objects o WHERE o.type_id = '610a7682ad3fc20e30dd2cba' AND o.is_template = 0 ORDER BY o.title",
  ).all() as Array<{ id: string; title: string }>;

  // All network devices
  const devices = db.prepare(
    "SELECT o.id, o.title FROM objects o WHERE o.type_id = '610a76b0ad3fc0094ca7eca0' AND o.is_template = 0 ORDER BY o.title",
  ).all() as Array<{ id: string; title: string }>;

  // Composition: device parent → device children
  const compositions = db.prepare(`
    SELECT r.source_id as parent_id, r.target_id as child_id
    FROM relationships r
    JOIN objects o1 ON o1.id = r.source_id
    JOIN objects o2 ON o2.id = r.target_id
    WHERE r.relationship_type = 'composition'
      AND o1.type_id = '610a76b0ad3fc0094ca7eca0'
      AND o2.type_id = '610a76b0ad3fc0094ca7eca0'
  `).all() as Array<{ parent_id: string; child_id: string }>;

  // Association: device ↔ network
  const deviceNetworkLinks = db.prepare(`
    SELECT r.source_id, r.target_id FROM relationships r
    JOIN objects o1 ON o1.id = r.source_id JOIN objects o2 ON o2.id = r.target_id
    WHERE r.relationship_type = 'association'
      AND ((o1.type_id = '610a76b0ad3fc0094ca7eca0' AND o2.type_id = '610a7682ad3fc20e30dd2cba')
        OR (o1.type_id = '610a7682ad3fc20e30dd2cba' AND o2.type_id = '610a76b0ad3fc0094ca7eca0'))
  `).all() as Array<{ source_id: string; target_id: string }>;

  // Association: device ↔ location
  const deviceLocationLinks = db.prepare(`
    SELECT r.source_id, r.target_id, o_loc.title as location_title, o_loc.id as location_id
    FROM relationships r
    JOIN objects o_dev ON (o_dev.id = r.source_id OR o_dev.id = r.target_id)
    JOIN objects o_loc ON (o_loc.id = r.source_id OR o_loc.id = r.target_id)
    WHERE r.relationship_type IN ('association', 'assignment')
      AND o_dev.type_id = '610a76b0ad3fc0094ca7eca0'
      AND o_loc.type_id = '532ffa70b41281c17ce263b5'
      AND o_dev.id != o_loc.id
  `).all() as Array<{ source_id: string; target_id: string; location_title: string; location_id: string }>;

  // Build device → networks map
  const networkIds = new Set(networks.map(n => n.id));
  const deviceIds = new Set(devices.map(d => d.id));
  const deviceToNetworks = new Map<string, string[]>();
  for (const link of deviceNetworkLinks) {
    const devId = deviceIds.has(link.source_id) ? link.source_id : link.target_id;
    const netId = networkIds.has(link.source_id) ? link.source_id : link.target_id;
    if (!deviceIds.has(devId) || !networkIds.has(netId)) continue;
    const list = deviceToNetworks.get(devId) ?? [];
    if (!list.includes(netId)) list.push(netId);
    deviceToNetworks.set(devId, list);
  }

  // Build device → location map
  const deviceToLocation = new Map<string, { id: string; title: string }>();
  for (const link of deviceLocationLinks) {
    const devId = deviceIds.has(link.source_id) ? link.source_id : link.target_id;
    if (deviceIds.has(devId)) {
      deviceToLocation.set(devId, { id: link.location_id, title: link.location_title });
    }
  }

  // Build parent → children map
  const childToParent = new Map<string, string>();
  const parentToChildren = new Map<string, string[]>();
  for (const comp of compositions) {
    childToParent.set(comp.child_id, comp.parent_id);
    const children = parentToChildren.get(comp.parent_id) ?? [];
    children.push(comp.child_id);
    parentToChildren.set(comp.parent_id, children);
  }

  // Build device entries (clusters = devices with children)
  const deviceMap = new Map(devices.map(d => [d.id, d]));
  const topLevelDevices = devices.filter(d => !childToParent.has(d.id));

  const deviceEntries = topLevelDevices.map(d => {
    const children = (parentToChildren.get(d.id) ?? []).map(cid => ({
      id: cid,
      title: deviceMap.get(cid)?.title ?? cid,
      networks: deviceToNetworks.get(cid) ?? [],
    }));

    return {
      id: d.id,
      title: d.title,
      networks: deviceToNetworks.get(d.id) ?? [],
      children,
      location: deviceToLocation.get(d.id) ?? null,
    };
  });

  // Sort: devices with most network connections first
  deviceEntries.sort((a, b) => (b.networks.length + b.children.length) - (a.networks.length + a.children.length));

  return { networks, devices: deviceEntries };
}

interface GraphNode { id: string; title: string; type: string }
interface GraphEdge { source: string; target: string; label: string; type: string }

function getObjectGraph(db: Database.Database, objectId: string, depth: number, typeFilter: Set<string> | null = null): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const visited = new Set<string>();

  function expand(id: string, level: number): void {
    if (visited.has(id) || level > depth) return;
    visited.add(id);

    const obj = db.prepare(
      "SELECT o.id, o.title, ot.name as type FROM objects o JOIN object_types ot ON o.type_id = ot.template_id WHERE o.id = ?",
    ).get(id) as GraphNode | undefined;
    if (!obj) return;
    nodes.set(id, obj);

    const rels = db.prepare(
      "SELECT r.target_id, r.relationship_type, r.relationship_name, o.id, o.title, ot.name as type FROM relationships r JOIN objects o ON o.id = r.target_id JOIN object_types ot ON o.type_id = ot.template_id WHERE r.source_id = ? UNION ALL SELECT r.source_id, r.relationship_type, r.relationship_name, o.id, o.title, ot.name as type FROM relationships r JOIN objects o ON o.id = r.source_id JOIN object_types ot ON o.type_id = ot.template_id WHERE r.target_id = ?",
    ).all(id, id) as Array<{ target_id: string; relationship_type: string; relationship_name: string; id: string; title: string; type: string }>;

    for (const rel of rels) {
      if (typeFilter && !typeFilter.has(rel.type) && rel.id !== objectId) continue;
      nodes.set(rel.id, { id: rel.id, title: rel.title, type: rel.type });
      edges.push({ source: id, target: rel.id, label: rel.relationship_name, type: rel.relationship_type });
      if (level < depth) expand(rel.id, level + 1);
    }
  }

  expand(objectId, 0);
  return { nodes: [...nodes.values()], edges };
}

// ── GGM (Gemeentelijk Gegevensmodel) ──

interface GgmAppRow { app_id: string; app_title: string; function_title: string }

function classifyApps(db: Database.Database): Map<string, GgmAppRow[]> {
  const rows = db.prepare(`
    SELECT DISTINCT app.id as app_id, app.title as app_title, bf.title as function_title
    FROM objects app
    JOIN relationships r1 ON r1.source_id = app.id AND r1.relationship_type = 'usedby'
    JOIN objects bp ON bp.id = r1.target_id AND bp.type_id = '531721d799ffecf9b5c8b1ad'
    JOIN relationships r2 ON (r2.source_id = bp.id OR r2.target_id = bp.id) AND r2.relationship_type = 'aggregation'
    JOIN objects bf ON (bf.id = r2.target_id OR bf.id = r2.source_id) AND bf.id != bp.id AND bf.type_id = '5852ada13bf3ff08c475d1fd'
    WHERE app.type_id = '532fffd0b41281c17ce263b9' AND app.is_template = 0
    ORDER BY app.title
  `).all() as GgmAppRow[];

  const byDomain = new Map<string, GgmAppRow[]>();
  for (const d of GGM_DOMAINS) byDomain.set(d.id, []);
  byDomain.set('onbekend', []);

  const classified = new Set<string>();
  for (const row of rows) {
    const domainId = classifyFunction(row.function_title) ?? 'onbekend';
    byDomain.get(domainId)!.push(row);
    classified.add(row.app_id);
  }

  const allApps = db.prepare(
    "SELECT id as app_id, title as app_title FROM objects WHERE type_id = '532fffd0b41281c17ce263b9' AND is_template = 0 ORDER BY title",
  ).all() as Array<{ app_id: string; app_title: string }>;

  for (const app of allApps) {
    if (!classified.has(app.app_id)) {
      // Fallback: classify by app title (catches kantoorautomatisering, infra, etc.)
      const titleDomain = classifyAppByTitle(app.app_title);
      const targetDomain = titleDomain ?? 'onbekend';
      if (!byDomain.has(targetDomain)) byDomain.set(targetDomain, []);
      byDomain.get(targetDomain)!.push({ ...app, function_title: '' });
    }
  }

  return byDomain;
}

function getGgmOverview(db: Database.Database): unknown {
  const byDomain = classifyApps(db);
  const totalApps = db.prepare(
    "SELECT count(*) as n FROM objects WHERE type_id = '532fffd0b41281c17ce263b9' AND is_template = 0",
  ).get() as { n: number };

  const unclassifiedCount = byDomain.get('onbekend')?.length ?? 0;

  const domains = GGM_DOMAINS.map(d => {
    const rows = byDomain.get(d.id) ?? [];
    const uniqueApps = [...new Map(rows.map(r => [r.app_id, r])).values()];
    return {
      id: d.id,
      name: d.name,
      color: d.color,
      appCount: uniqueApps.length,
      apps: uniqueApps.slice(0, 8).map(a => ({ id: a.app_id, title: a.app_title })),
    };
  }).filter(d => d.appCount > 0);

  return {
    totalApps: totalApps.n,
    classifiedApps: totalApps.n - unclassifiedCount,
    coverage: Math.round((totalApps.n - unclassifiedCount) / totalApps.n * 100),
    domains,
    unclassifiedCount,
    unclassified: { appCount: unclassifiedCount, functionCount: 0 },
  };
}

function getGgmDomainDetail(db: Database.Database, domainId: string): unknown {
  const domain = GGM_DOMAINS.find(d => d.id === domainId);
  if (!domain) return { error: 'Domain not found' };

  const byDomain = classifyApps(db);
  const rows = byDomain.get(domainId) ?? [];
  const uniqueApps = [...new Map(rows.map(r => [r.app_id, r])).values()];
  const uniqueFunctions = [...new Set(rows.map(r => r.function_title))].filter(Boolean).sort();
  const appIds = uniqueApps.map(a => a.app_id);

  let processes: Array<{ id: string; title: string }> = [];
  let actors: Array<{ id: string; title: string }> = [];

  if (appIds.length > 0) {
    const ph = appIds.map(() => '?').join(',');
    processes = db.prepare(
      `SELECT DISTINCT o.id, o.title FROM relationships r JOIN objects o ON o.id = r.target_id WHERE r.source_id IN (${ph}) AND r.relationship_type = 'usedby' AND o.type_id = '531721d799ffecf9b5c8b1ad' ORDER BY o.title`,
    ).all(...appIds) as Array<{ id: string; title: string }>;

    actors = db.prepare(
      `SELECT DISTINCT o.id, o.title FROM relationships r JOIN objects o ON o.id = r.target_id WHERE r.source_id IN (${ph}) AND o.type_id = '532ff9dbb41281c17ce263b2' ORDER BY o.title`,
    ).all(...appIds) as Array<{ id: string; title: string }>;
  }

  // Group apps by bedrijfsfunctie for the GGM detail view
  const functionGroups = uniqueFunctions.map((fnTitle, idx) => {
    const fnApps = rows
      .filter(r => r.function_title === fnTitle)
      .map(r => ({ id: r.app_id, title: r.app_title }));
    const uniqueAppsInFn = [...new Map(fnApps.map(a => [a.id, a])).values()];
    return { id: `fn-${idx}`, title: fnTitle, apps: uniqueAppsInFn };
  });

  return {
    domain: { id: domain.id, name: domain.name, color: domain.color },
    functions: functionGroups,
    apps: uniqueApps.map(a => {
      const funcs = rows.filter(r => r.app_id === a.app_id).map(r => r.function_title).filter(Boolean);
      return { id: a.app_id, title: a.app_title, functions: funcs };
    }),
    processes,
    actors,
  };
}

function getDashboardView(db: Database.Database, view: string): unknown {
  if (view === 'overview') {
    const types = db.prepare(
      `SELECT ot.name, count(*) as count FROM objects o
       JOIN object_types ot ON o.type_id = ot.template_id
       WHERE o.is_template = 0 GROUP BY ot.name ORDER BY count DESC`,
    ).all();
    const relTypes = db.prepare(
      `SELECT relationship_type as type, count(*) as count FROM relationships GROUP BY relationship_type ORDER BY count DESC`,
    ).all();
    return { types, relTypes };
  }

  if (view === 'locations') {
    const locations = db.prepare(
      `SELECT o2.id, o2.title as location, count(DISTINCT r.source_id) as objects
       FROM relationships r
       JOIN objects o2 ON o2.id = r.target_id
       JOIN object_types ot ON o2.type_id = ot.template_id
       WHERE ot.name = 'Locatie'
       GROUP BY o2.id ORDER BY objects DESC`,
    ).all();
    return { locations };
  }

  if (view === 'coverage') {
    const orphans = db.prepare(
      `SELECT o.id, o.title, ot.name as type FROM objects o
       JOIN object_types ot ON o.type_id = ot.template_id
       WHERE o.is_template = 0
       AND o.id NOT IN (SELECT source_id FROM relationships)
       AND o.id NOT IN (SELECT target_id FROM relationships)
       ORDER BY ot.name, o.title`,
    ).all();
    const byType: Record<string, number> = {};
    for (const o of orphans as Array<{ type: string }>) {
      byType[o.type] = (byType[o.type] ?? 0) + 1;
    }
    return { orphans, byType, total: (orphans as unknown[]).length };
  }

  if (view === 'risks') {
    // Apps without processes
    const noProcess = db.prepare(
      `SELECT o.id, o.title FROM objects o
       JOIN object_types ot ON o.type_id = ot.template_id
       WHERE ot.name = 'Applicatie'
       AND o.id NOT IN (
         SELECT r.source_id FROM relationships r WHERE r.relationship_type = 'usedby'
         UNION SELECT r.target_id FROM relationships r WHERE r.relationship_type = 'usedby'
       ) ORDER BY o.title LIMIT 100`,
    ).all();
    // Apps without actors
    const noActor = db.prepare(
      `SELECT o.id, o.title FROM objects o
       JOIN object_types ot ON o.type_id = ot.template_id
       WHERE ot.name = 'Applicatie'
       AND o.id NOT IN (
         SELECT r.source_id FROM relationships r
         JOIN objects o2 ON o2.id = r.target_id
         JOIN object_types ot2 ON o2.type_id = ot2.template_id
         WHERE ot2.name = 'Actor'
         UNION
         SELECT r.target_id FROM relationships r
         JOIN objects o2 ON o2.id = r.source_id
         JOIN object_types ot2 ON o2.type_id = ot2.template_id
         WHERE ot2.name = 'Actor'
       ) ORDER BY o.title LIMIT 100`,
    ).all();
    return { noProcess, noActor };
  }

  return { error: 'Unknown dashboard view' };
}
