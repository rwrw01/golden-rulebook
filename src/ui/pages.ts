/**
 * HTML page rendering for impact analysis
 */
import type Database from 'better-sqlite3';

import { GGM_DOMAINS, classifyFunction } from '../data/ggm-domains.js';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function layout(title: string, body: string, activePage: string): string {
  return `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)} — Impact Analyse</title>
  <link rel="stylesheet" href="/style.css">
</head>
<body>
<header><div class="container">
  <h1>Impact Analyse</h1>
  <nav>
    <a href="/" class="${activePage === 'home' ? 'active' : ''}">Dashboard</a>
    <a href="/chat" class="${activePage === 'chat' ? 'active' : ''}">Incident Chat</a>
    <a href="/apps" class="${activePage === 'apps' ? 'active' : ''}">Applicaties</a>
    <a href="/ggm" class="${activePage === 'ggm' ? 'active' : ''}">GGM</a>
    <a href="/graph" class="${activePage === 'graph' ? 'active' : ''}">Architectuur</a>
  </nav>
</div></header>
<div class="container">${body}</div>
</body>
</html>`;
}

export function renderPage(path: string, params: URLSearchParams, db: Database.Database): string {
  if (path === '/') return renderDashboard(db);
  if (path === '/chat') return renderChatPage();
  if (path === '/apps') return renderApps(db, params.get('q') ?? '');
  if (path.startsWith('/app/')) return renderAppDetail(db, path.slice(5));
  if (path === '/graph') return renderGraphPage(params.get('id') ?? '');
  if (path === '/ggm') return renderGgm(db);
  if (path.startsWith('/ggm/')) return renderGgmDomain(db, path.slice(5));
  return layout('404', '<h2>Pagina niet gevonden</h2>', '');
}

function renderDashboard(db: Database.Database): string {
  const stats = db.prepare(`
    SELECT
      (SELECT count(*) FROM objects WHERE is_template = 0) as objects,
      (SELECT count(*) FROM objects WHERE type_id = '532fffd0b41281c17ce263b9' AND is_template = 0) as apps,
      (SELECT count(*) FROM relationships) as relations,
      (SELECT count(*) FROM objects WHERE type_id = '531721d799ffecf9b5c8b1ad' AND is_template = 0) as processes,
      (SELECT count(*) FROM objects WHERE type_id = '532ff9dbb41281c17ce263b2' AND is_template = 0) as actors
  `).get() as { objects: number; apps: number; relations: number; processes: number; actors: number };

  const body = `
<h2>Dashboard</h2>
<div class="stats">
  <div class="stat"><div class="value">${stats.apps}</div><div class="label">Applicaties</div></div>
  <div class="stat"><div class="value">${stats.processes}</div><div class="label">Processen</div></div>
  <div class="stat"><div class="value">${stats.actors}</div><div class="label">Actoren</div></div>
  <div class="stat"><div class="value">${stats.relations}</div><div class="label">Relaties</div></div>
  <div class="stat"><div class="value">${stats.objects}</div><div class="label">Totaal objecten</div></div>
</div>

<h3>Zoek applicatie voor impactanalyse</h3>
<form action="/apps" method="get">
  <input class="search-box" type="text" name="q" placeholder="Zoek op naam... bijv. ESB, Allegro, Office" autofocus>
</form>

<h3 style="margin-top:24px">Objecten per type</h3>
<div class="card">
<table>
<thead><tr><th>Type</th><th>Aantal</th></tr></thead>
<tbody>
${(db.prepare("SELECT ot.name, count(*) as n FROM objects o JOIN object_types ot ON o.type_id = ot.template_id WHERE o.is_template = 0 GROUP BY ot.name ORDER BY n DESC").all() as Array<{ name: string; n: number }>).map(r => '<tr><td>' + esc(r.name) + '</td><td>' + r.n + '</td></tr>').join('\n')}
</tbody>
</table>
</div>`;

  return layout('Dashboard', body, 'home');
}

function renderApps(db: Database.Database, query: string): string {
  let apps: Array<{ id: string; title: string; loc: string | null }>;

  if (query.length >= 2) {
    apps = db.prepare(`
      SELECT o.id, o.title,
        (SELECT GROUP_CONCAT(o2.title, ', ') FROM relationships r JOIN objects o2 ON o2.id = r.target_id
         WHERE r.source_id = o.id AND r.relationship_type = 'assignment' AND o2.type_id = '532ffa70b41281c17ce263b5') as loc
      FROM objects o
      WHERE o.type_id = '532fffd0b41281c17ce263b9' AND o.is_template = 0 AND o.title LIKE ?
      ORDER BY o.title LIMIT 100
    `).all('%' + query + '%') as Array<{ id: string; title: string; loc: string | null }>;
  } else {
    apps = db.prepare(`
      SELECT o.id, o.title,
        (SELECT GROUP_CONCAT(o2.title, ', ') FROM relationships r JOIN objects o2 ON o2.id = r.target_id
         WHERE r.source_id = o.id AND r.relationship_type = 'assignment' AND o2.type_id = '532ffa70b41281c17ce263b5') as loc
      FROM objects o
      WHERE o.type_id = '532fffd0b41281c17ce263b9' AND o.is_template = 0
      ORDER BY o.title LIMIT 100
    `).all() as Array<{ id: string; title: string; loc: string | null }>;
  }

  const body = `
<h2>Applicaties${query ? ' — zoekresultaat "' + esc(query) + '"' : ''}</h2>
<form action="/apps" method="get">
  <input class="search-box" type="text" name="q" value="${esc(query)}" placeholder="Zoek op naam..." autofocus>
</form>
<div class="card">
<table>
<thead><tr><th>Applicatie</th><th>Locatie</th></tr></thead>
<tbody>
${apps.map(a => '<tr><td><a href="/app/' + esc(a.id) + '">' + esc(a.title) + '</a></td><td>' + (a.loc ? a.loc.split(', ').map(l => '<span class="badge ' + (l === 'Cloud' ? 'badge-cloud' : 'badge-onprem') + '">' + esc(l) + '</span> ').join('') : '<span class="badge">-</span>') + '</td></tr>').join('\n')}
</tbody>
</table>
</div>
<p class="card-meta">${apps.length} resultaten</p>`;

  return layout('Applicaties', body, 'apps');
}

function renderAppDetail(db: Database.Database, appId: string): string {
  const app = db.prepare(
    "SELECT o.id, o.title, ot.name as type_name FROM objects o JOIN object_types ot ON o.type_id = ot.template_id WHERE o.id = ?",
  ).get(appId) as { id: string; title: string; type_name: string } | undefined;

  if (!app) return layout('Niet gevonden', '<h2>Applicatie niet gevonden</h2>', 'apps');

  // Build impact chain
  const locations = db.prepare(
    "SELECT o.id, o.title FROM relationships r JOIN objects o ON o.id = r.target_id WHERE r.source_id = ? AND r.relationship_type = 'assignment' AND o.type_id = '532ffa70b41281c17ce263b5'",
  ).all(appId) as Array<{ id: string; title: string }>;

  const processes = db.prepare(
    "SELECT DISTINCT o.id, o.title FROM relationships r JOIN objects o ON o.id = r.target_id WHERE r.source_id = ? AND r.relationship_type = 'usedby' AND o.type_id = '531721d799ffecf9b5c8b1ad'",
  ).all(appId) as Array<{ id: string; title: string }>;

  const actors = db.prepare(
    "SELECT DISTINCT o.id, o.title FROM relationships r JOIN objects o ON o.id = r.target_id WHERE r.source_id = ? AND o.type_id = '532ff9dbb41281c17ce263b2'",
  ).all(appId) as Array<{ id: string; title: string }>;

  const deps = db.prepare(
    "SELECT o.id, o.title, 'uitvoer naar' as dir FROM relationships r JOIN objects o ON o.id = r.target_id WHERE r.source_id = ? AND r.relationship_type = 'flow' AND o.type_id = '532fffd0b41281c17ce263b9' UNION SELECT o.id, o.title, 'invoer van' as dir FROM relationships r JOIN objects o ON o.id = r.source_id WHERE r.target_id = ? AND r.relationship_type = 'flow' AND o.type_id = '532fffd0b41281c17ce263b9'",
  ).all(appId, appId) as Array<{ id: string; title: string; dir: string }>;

  const infra = db.prepare(
    "SELECT o.id, o.title, ot.name as type FROM relationships r JOIN objects o ON o.id = r.target_id JOIN object_types ot ON o.type_id = ot.template_id WHERE r.source_id = ? AND r.relationship_type IN ('realization','access')",
  ).all(appId) as Array<{ id: string; title: string; type: string }>;

  const allRelations = db.prepare(
    "SELECT o.id, o.title, ot.name as type, r.relationship_name, r.relationship_type FROM relationships r JOIN objects o ON o.id = r.target_id JOIN object_types ot ON o.type_id = ot.template_id WHERE r.source_id = ? ORDER BY ot.name, o.title",
  ).all(appId) as Array<{ id: string; title: string; type: string; relationship_name: string; relationship_type: string }>;

  function renderItems(items: Array<{ id: string; title: string }>, linkPrefix?: string): string {
    if (items.length === 0) return '<span class="tag">Geen</span>';
    return items.map(i => linkPrefix
      ? '<a href="' + linkPrefix + esc(i.id) + '" class="tag">' + esc(i.title) + '</a>'
      : '<span class="tag">' + esc(i.title) + '</span>',
    ).join(' ');
  }

  const body = `
<h2>${esc(app.title)}</h2>
<p class="card-meta" style="margin-bottom:24px">${esc(app.type_name)} · <a href="/graph?id=${esc(app.id)}">Bekijk architectuurplaat</a></p>

<div class="impact-chain">
  <div class="impact-level app">
    <h4>Applicatie (bron storing)</h4>
    <div class="items"><span class="tag">${esc(app.title)}</span></div>
  </div>
  <div class="impact-level location">
    <h4>Locatie</h4>
    <div class="items">${renderItems(locations)}</div>
  </div>
  <div class="impact-level process">
    <h4>Getroffen bedrijfsprocessen (${processes.length})</h4>
    <div class="items">${renderItems(processes)}</div>
  </div>
  <div class="impact-level actor">
    <h4>Te informeren actoren (${actors.length})</h4>
    <div class="items">${renderItems(actors)}</div>
  </div>
</div>

<h3 style="margin-top:24px">Architectuurdiagram</h3>
<div class="graph-container" style="overflow-x:auto">
  <img src="/api/diagram/${esc(app.id)}" alt="Architectuurdiagram ${esc(app.title)}" style="max-width:100%;height:auto">
</div>

${deps.length > 0 ? `
<h3 style="margin-top:24px">Afhankelijkheden (${deps.length})</h3>
<div class="card">
${deps.map(d => '<a href="/app/' + esc(d.id) + '" class="tag">' + esc(d.dir) + ': ' + esc(d.title) + '</a> ').join('')}
</div>` : ''}

${infra.length > 0 ? `
<h3 style="margin-top:24px">Infrastructuur (${infra.length})</h3>
<div class="card">
${infra.map(i => '<span class="tag">' + esc(i.type) + ': ' + esc(i.title) + '</span> ').join('')}
</div>` : ''}

<h3 style="margin-top:24px">Alle relaties (${allRelations.length})</h3>
<div class="card">
<table>
<thead><tr><th>Object</th><th>Type</th><th>Relatie</th></tr></thead>
<tbody>
${allRelations.map(r => '<tr><td>' + esc(r.title) + '</td><td>' + esc(r.type) + '</td><td>' + esc(r.relationship_name) + '</td></tr>').join('\n')}
</tbody>
</table>
</div>`;

  return layout(app.title, body, 'apps');
}

function renderGraphPage(objectId: string): string {
  const body = `
<h2>Architectuurplaat</h2>
<form action="/graph" method="get" style="display:flex;gap:8px;margin-bottom:16px">
  <input class="search-box" style="margin-bottom:0" type="text" name="q" placeholder="Zoek object...">
  <input type="hidden" name="id" value="${esc(objectId)}">
</form>
<div class="graph-container" id="graph">
  ${objectId ? '<p>Laden...</p>' : '<p style="color:var(--dim)">Selecteer een applicatie om de architectuurplaat te zien.</p>'}
</div>
${objectId ? `
<script>
(async function() {
  var res = await fetch('/api/graph?id=${esc(objectId)}&depth=1');
  var data = await res.json();
  var container = document.getElementById('graph');

  if (!data.nodes || data.nodes.length === 0) {
    container.innerHTML = '<p>Geen data gevonden</p>';
    return;
  }

  // Simple SVG rendering
  var typeColors = {
    'Applicatie': '#4f8ff7', 'Bedrijfsproces': '#f59e0b', 'Bedrijfsfunctie': '#a855f7',
    'Actor': '#22c55e', 'Locatie': '#06b6d4', 'Database': '#ef4444', 'Node': '#ec4899',
    'Package': '#8b5cf6', 'Applicatie-interface': '#14b8a6', 'Gegevensobject': '#f97316',
    'Bedrijfsobject': '#eab308', 'Applicatieservice': '#6366f1', 'Referentiecomponent': '#84cc16',
  };

  // Layout: center node + ring
  var centerNode = data.nodes.find(function(n) { return n.id === '${esc(objectId)}'; });
  var otherNodes = data.nodes.filter(function(n) { return n.id !== '${esc(objectId)}'; });

  var w = container.clientWidth;
  var h = Math.max(500, otherNodes.length * 18);
  container.style.minHeight = h + 'px';

  var cx = w / 2;
  var cy = h / 2;
  var radius = Math.min(w, h) / 2.5;

  var positions = {};
  positions['${esc(objectId)}'] = { x: cx, y: cy };
  otherNodes.forEach(function(n, i) {
    var angle = (2 * Math.PI * i) / otherNodes.length - Math.PI / 2;
    positions[n.id] = { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
  });

  var svg = '<svg width="' + w + '" height="' + h + '" xmlns="http://www.w3.org/2000/svg">';

  // Edges
  var uniqueEdges = {};
  data.edges.forEach(function(e) {
    var key = [e.source, e.target].sort().join('-');
    if (!uniqueEdges[key] && positions[e.source] && positions[e.target]) {
      uniqueEdges[key] = e;
    }
  });
  Object.values(uniqueEdges).forEach(function(e) {
    var s = positions[e.source];
    var t = positions[e.target];
    if (s && t) {
      svg += '<line x1="' + s.x + '" y1="' + s.y + '" x2="' + t.x + '" y2="' + t.y + '" stroke="#2a2d3a" stroke-width="1"/>';
    }
  });

  // Nodes
  data.nodes.forEach(function(n) {
    var p = positions[n.id];
    if (!p) return;
    var color = typeColors[n.type] || '#666';
    var isCenter = n.id === '${esc(objectId)}';
    var r = isCenter ? 8 : 5;
    svg += '<circle cx="' + p.x + '" cy="' + p.y + '" r="' + r + '" fill="' + color + '" stroke="' + (isCenter ? '#fff' : 'none') + '" stroke-width="2"/>';
    svg += '<text x="' + (p.x + r + 4) + '" y="' + (p.y + 4) + '" fill="#e1e4ed" font-size="11" font-family="system-ui">' + n.title.replace(/&/g,"&amp;").replace(/</g,"&lt;") + '</text>';
  });

  svg += '</svg>';
  container.innerHTML = svg;

  // Legend
  var legend = '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px">';
  var usedTypes = {};
  data.nodes.forEach(function(n) { usedTypes[n.type] = typeColors[n.type] || '#666'; });
  Object.keys(usedTypes).forEach(function(t) {
    legend += '<span style="display:flex;align-items:center;gap:4px;font-size:11px;color:#8b8fa3"><span style="width:10px;height:10px;border-radius:50%;background:' + usedTypes[t] + ';display:inline-block"></span>' + t + '</span>';
  });
  legend += '</div>';
  container.insertAdjacentHTML('afterend', legend);
})();
</script>` : ''}`;

  return layout('Architectuur', body, 'graph');
}

interface GgmAppRow { app_id: string; app_title: string; function_title: string }

function getGgmClassification(db: Database.Database): Map<string, GgmAppRow[]> {
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
  for (const domain of GGM_DOMAINS) byDomain.set(domain.id, []);
  byDomain.set('onbekend', []);

  const classified = new Set<string>();
  for (const row of rows) {
    const domainId = classifyFunction(row.function_title) ?? 'onbekend';
    byDomain.get(domainId)!.push(row);
    classified.add(row.app_id);
  }

  // Add unclassified apps
  const totalApps = db.prepare(
    "SELECT id as app_id, title as app_title FROM objects WHERE type_id = '532fffd0b41281c17ce263b9' AND is_template = 0 ORDER BY title",
  ).all() as Array<{ app_id: string; app_title: string }>;

  const unclassified = totalApps.filter(a => !classified.has(a.app_id));
  for (const app of unclassified) {
    byDomain.get('onbekend')!.push({ ...app, function_title: '' });
  }

  return byDomain;
}

function renderGgm(db: Database.Database): string {
  const byDomain = getGgmClassification(db);
  const totalApps = db.prepare(
    "SELECT count(*) as n FROM objects WHERE type_id = '532fffd0b41281c17ce263b9' AND is_template = 0",
  ).get() as { n: number };

  const classifiedCount = totalApps.n - (byDomain.get('onbekend')?.length ?? 0);
  const pct = Math.round(classifiedCount / totalApps.n * 100);

  const cards = GGM_DOMAINS.map(domain => {
    const rows = byDomain.get(domain.id) ?? [];
    const uniqueApps = [...new Map(rows.map(r => [r.app_id, r])).values()];
    if (uniqueApps.length === 0) return '';
    const preview = uniqueApps.slice(0, 5);
    return `
    <a href="/ggm/${esc(domain.id)}" class="ggm-card" style="border-left:4px solid ${domain.color}">
      <h4 style="color:${domain.color}">${esc(domain.name)}</h4>
      <div class="ggm-count">${uniqueApps.length} applicaties</div>
      <div class="ggm-preview">${preview.map(a => esc(a.app_title)).join(', ')}${uniqueApps.length > 5 ? ', ...' : ''}</div>
    </a>`;
  }).filter(Boolean).join('\n');

  const unclassified = byDomain.get('onbekend') ?? [];

  const body = `
<h2>GGM — Gemeentelijk Gegevensmodel</h2>
<div class="stats">
  <div class="stat"><div class="value">${classifiedCount}</div><div class="label">Geclassificeerd</div></div>
  <div class="stat"><div class="value">${totalApps.n}</div><div class="label">Totaal apps</div></div>
  <div class="stat"><div class="value">${pct}%</div><div class="label">Dekking</div></div>
  <div class="stat"><div class="value">${unclassified.length}</div><div class="label">Niet geclassificeerd</div></div>
</div>

<p class="card-meta" style="margin:16px 0">Applicaties gegroepeerd per gemeentelijk domein op basis van gekoppelde bedrijfsfuncties.</p>

<div class="ggm-grid">
${cards}
</div>

${unclassified.length > 0 ? `
<h3 style="margin-top:24px">Niet geclassificeerd (${unclassified.length})</h3>
<p class="card-meta">Deze applicaties hebben geen koppeling met een bedrijfsfunctie, of de functie kon niet aan een GGM-domein worden gekoppeld.</p>
<div class="card">
<div style="display:flex;flex-wrap:wrap;gap:4px">
${unclassified.slice(0, 80).map(a => '<a href="/app/' + esc(a.app_id) + '" class="tag">' + esc(a.app_title) + '</a>').join('\n')}
${unclassified.length > 80 ? '<span class="tag">... en ' + (unclassified.length - 80) + ' meer</span>' : ''}
</div>
</div>` : ''}`;

  return layout('GGM Overzicht', body, 'ggm');
}

function renderGgmDomain(db: Database.Database, domainId: string): string {
  const domain = GGM_DOMAINS.find(d => d.id === domainId);
  if (!domain) return layout('Onbekend domein', '<h2>Domein niet gevonden</h2>', 'ggm');

  const byDomain = getGgmClassification(db);
  const rows = byDomain.get(domainId) ?? [];
  const uniqueApps = [...new Map(rows.map(r => [r.app_id, r])).values()];
  const uniqueFunctions = [...new Set(rows.map(r => r.function_title))].sort();

  // Get processes for these apps
  const appIds = uniqueApps.map(a => a.app_id);
  let processes: Array<{ id: string; title: string }> = [];
  let actors: Array<{ id: string; title: string }> = [];

  if (appIds.length > 0) {
    const placeholders = appIds.map(() => '?').join(',');
    processes = db.prepare(`
      SELECT DISTINCT o.id, o.title FROM relationships r
      JOIN objects o ON o.id = r.target_id
      WHERE r.source_id IN (${placeholders}) AND r.relationship_type = 'usedby'
      AND o.type_id = '531721d799ffecf9b5c8b1ad' ORDER BY o.title
    `).all(...appIds) as Array<{ id: string; title: string }>;

    actors = db.prepare(`
      SELECT DISTINCT o.id, o.title FROM relationships r
      JOIN objects o ON o.id = r.target_id
      WHERE r.source_id IN (${placeholders}) AND o.type_id = '532ff9dbb41281c17ce263b2'
      ORDER BY o.title
    `).all(...appIds) as Array<{ id: string; title: string }>;
  }

  const body = `
<h2 style="color:${domain.color}">${esc(domain.name)}</h2>
<p class="card-meta"><a href="/ggm">← Terug naar GGM overzicht</a></p>

<div class="stats">
  <div class="stat"><div class="value">${uniqueApps.length}</div><div class="label">Applicaties</div></div>
  <div class="stat"><div class="value">${processes.length}</div><div class="label">Processen</div></div>
  <div class="stat"><div class="value">${actors.length}</div><div class="label">Actoren</div></div>
  <div class="stat"><div class="value">${uniqueFunctions.length}</div><div class="label">Functies</div></div>
</div>

<h3 style="margin-top:24px">Applicaties (${uniqueApps.length})</h3>
<div class="card">
<table>
<thead><tr><th>Applicatie</th><th>Bedrijfsfunctie</th></tr></thead>
<tbody>
${uniqueApps.map(a => {
    const funcs = rows.filter(r => r.app_id === a.app_id).map(r => r.function_title);
    return '<tr><td><a href="/app/' + esc(a.app_id) + '">' + esc(a.app_title) + '</a></td><td>' + funcs.map(f => esc(f)).join(', ') + '</td></tr>';
  }).join('\n')}
</tbody>
</table>
</div>

${processes.length > 0 ? `
<h3 style="margin-top:24px">Bedrijfsprocessen (${processes.length})</h3>
<div class="card">
<div style="display:flex;flex-wrap:wrap;gap:4px">
${processes.map(p => '<span class="tag">' + esc(p.title) + '</span>').join('\n')}
</div>
</div>` : ''}

${actors.length > 0 ? `
<h3 style="margin-top:24px">Actoren (${actors.length})</h3>
<div class="card">
<div style="display:flex;flex-wrap:wrap;gap:4px">
${actors.map(a => '<span class="tag">' + esc(a.title) + '</span>').join('\n')}
</div>
</div>` : ''}

<h3 style="margin-top:24px">Bedrijfsfuncties (${uniqueFunctions.length})</h3>
<div class="card">
<div style="display:flex;flex-wrap:wrap;gap:4px">
${uniqueFunctions.map(f => '<span class="tag">' + esc(f) + '</span>').join('\n')}
</div>
</div>`;

  return layout(domain.name, body, 'ggm');
}

function renderChatPage(): string {
  const body = `
<div class="chat-container">
  <div class="chat-messages" id="messages">
    <div class="chat-msg assistant">
      <p>Welkom bij de Impact Analyse chat. Ik help je bij het analyseren van ICT-incidenten.</p>
      <p>Beschrijf je probleem, bijvoorbeeld:</p>
      <ul>
        <li>"Er is een storing in de ESB"</li>
        <li>"Allegro is onbereikbaar"</li>
        <li>"Welke processen raakt een storing in JOIN Zaak?"</li>
        <li>"Wie moeten we informeren als Office 365 eruit ligt?"</li>
      </ul>
    </div>
  </div>
  <div class="chat-input-row">
    <input class="chat-input" id="chatInput" type="text" placeholder="Beschrijf het incident..." autofocus>
    <button class="chat-send" id="chatSend">Verstuur</button>
  </div>
</div>
<script>
var chatHistory = [];
var messagesEl = document.getElementById('messages');
var inputEl = document.getElementById('chatInput');
var sendBtn = document.getElementById('chatSend');

function addMessage(role, html) {
  var div = document.createElement('div');
  div.className = 'chat-msg ' + role;
  div.innerHTML = html;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return div;
}

function markdownToHtml(text) {
  var html = text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>')
    .replace(/\\*(.+?)\\*/g, '<em>$1</em>')
    .replace(/\`([^\`]+)\`/g, '<code>$1</code>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\\[([^\\]]+)\\]\\((\\/app\\/[^)]+)\\)/g, '<a href="$2">$1</a>');
  // Group consecutive list items into <ul> blocks, then convert remaining newlines
  var lines = html.split('\\n');
  var result = [];
  var inList = false;
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (line.match(/^- /)) {
      if (!inList) { result.push('<ul>'); inList = true; }
      result.push('<li>' + line.slice(2) + '</li>');
    } else {
      if (inList) { result.push('</ul>'); inList = false; }
      if (line === '---') { result.push('<hr>'); }
      else if (line === '') { result.push(''); }
      else { result.push('<p>' + line + '</p>'); }
    }
  }
  if (inList) result.push('</ul>');
  return result.join('\\n');
}

async function sendMessage() {
  var text = inputEl.value.trim();
  if (!text) return;

  inputEl.value = '';
  sendBtn.disabled = true;
  addMessage('user', text.replace(/&/g,'&amp;').replace(/</g,'&lt;'));
  chatHistory.push({ role: 'user', content: text });

  var assistantDiv = addMessage('assistant', '<div class="typing-indicator"><span></span><span></span><span></span></div>');
  var content = '';

  try {
    var res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, history: chatHistory.slice(-10) }),
    });

    var reader = res.body.getReader();
    var decoder = new TextDecoder();
    var buffer = '';

    while (true) {
      var result = await reader.read();
      if (result.done) break;
      buffer += decoder.decode(result.value, { stream: true });

      var lines = buffer.split('\\n');
      buffer = lines.pop() || '';

      for (var line of lines) {
        if (!line.startsWith('data: ')) continue;
        var data = JSON.parse(line.slice(6));

        if (data.text) {
          content += data.text;
          assistantDiv.innerHTML = markdownToHtml(content);
          messagesEl.scrollTop = messagesEl.scrollHeight;
        }

        if (data.done && data.matched_apps && data.matched_apps.length > 0) {
          var links = '<div class="chat-matched">';
          data.matched_apps.forEach(function(app) {
            links += '<a href="/app/' + app.id + '" class="tag">' + app.title + '</a>';
          });
          links += '</div>';
          assistantDiv.innerHTML += links;
        }

        if (data.error) {
          assistantDiv.innerHTML = '<p style="color:var(--red)">Fout: ' + data.error + '</p>';
        }
      }
    }

    chatHistory.push({ role: 'assistant', content: content });
  } catch (err) {
    assistantDiv.innerHTML = '<p style="color:var(--red)">Verbindingsfout: ' + err.message + '</p>';
  }

  sendBtn.disabled = false;
  inputEl.focus();
}

sendBtn.addEventListener('click', sendMessage);
inputEl.addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});
</script>`;

  return layout('Incident Chat', body, 'chat');
}
