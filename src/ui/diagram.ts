/**
 * Generate dynamic SVG architecture diagrams from impact database
 * Style: layered blocks with rounded corners, drop shadows, colored headers, dashed connectors
 */
import type Database from 'better-sqlite3';

interface DiagramNode {
  id: string;
  title: string;
  type: string;
  layer: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface DiagramEdge {
  sourceId: string;
  targetId: string;
  label: string;
}

const LAYER_CONFIG: Record<string, { color: string; headerBg: string; label: string; order: number }> = {
  'Actor':              { color: '#22c55e', headerBg: '#166534', label: 'Organisatie', order: 0 },
  'Bedrijfsfunctie':    { color: '#a855f7', headerBg: '#6b21a8', label: 'Bedrijfsfuncties', order: 1 },
  'Bedrijfsproces':     { color: '#f59e0b', headerBg: '#92400e', label: 'Bedrijfsprocessen', order: 2 },
  'Bedrijfsservice':    { color: '#06b6d4', headerBg: '#155e75', label: 'Bedrijfsservices', order: 2 },
  'Applicatie':         { color: '#4f8ff7', headerBg: '#1e40af', label: 'Applicaties', order: 3 },
  'Applicatieservice':  { color: '#6366f1', headerBg: '#3730a3', label: 'Applicatieservices', order: 3 },
  'Applicatie-interface': { color: '#14b8a6', headerBg: '#115e59', label: 'Interfaces', order: 4 },
  'Gegevensobject':     { color: '#f97316', headerBg: '#9a3412', label: 'Gegevens', order: 5 },
  'Bedrijfsobject':     { color: '#eab308', headerBg: '#854d0e', label: 'Bedrijfsobjecten', order: 5 },
  'Database':           { color: '#ef4444', headerBg: '#991b1b', label: 'Databases', order: 6 },
  'Node':               { color: '#ec4899', headerBg: '#9d174d', label: 'Infrastructuur', order: 7 },
  'Package':            { color: '#8b5cf6', headerBg: '#5b21b6', label: 'Packages', order: 7 },
  'Locatie':            { color: '#06b6d4', headerBg: '#155e75', label: 'Locaties', order: 8 },
  'Referentiecomponent': { color: '#84cc16', headerBg: '#3f6212', label: 'Referentie', order: 4 },
};

function getConfig(type: string): { color: string; headerBg: string; label: string; order: number } {
  return LAYER_CONFIG[type] ?? { color: '#6b7280', headerBg: '#374151', label: type, order: 99 };
}

export function generateAppDiagram(db: Database.Database, appId: string): string {
  // Fetch app + related objects
  const app = db.prepare(
    "SELECT o.id, o.title, ot.name as type FROM objects o JOIN object_types ot ON o.type_id = ot.template_id WHERE o.id = ?",
  ).get(appId) as { id: string; title: string; type: string } | undefined;
  if (!app) return '<svg><text>Niet gevonden</text></svg>';

  const related = db.prepare(
    "SELECT o.id, o.title, ot.name as type, r.relationship_name as rel_name, r.relationship_type as rel_type FROM relationships r JOIN objects o ON o.id = r.target_id JOIN object_types ot ON o.type_id = ot.template_id WHERE r.source_id = ? ORDER BY ot.name",
  ).all(appId) as Array<{ id: string; title: string; type: string; rel_name: string; rel_type: string }>;

  // Group by type, then by layer
  const byType = new Map<string, Array<{ id: string; title: string; rel_name: string }>>();
  for (const r of related) {
    const list = byType.get(r.type) ?? [];
    list.push({ id: r.id, title: r.title, rel_name: r.rel_name });
    byType.set(r.type, list);
  }

  // Sort types by layer order
  const sortedTypes = [...byType.entries()].sort((a, b) => getConfig(a[0]).order - getConfig(b[0]).order);

  // Layout constants
  const PAD = 24;
  const NODE_W = 180;
  const NODE_H = 48;
  const HEADER_H = 24;
  const ROW_GAP = 80;
  const COL_GAP = 16;
  const LAYER_PAD = 12;

  // Calculate layout
  const nodes: DiagramNode[] = [];
  const edges: DiagramEdge[] = [];
  const layerBoxes: Array<{ label: string; color: string; headerBg: string; x: number; y: number; w: number; h: number }> = [];

  // Center app node
  let currentY = PAD;

  // Build layers
  let maxWidth = 0;

  // App node first (centered, will position after knowing total width)
  const appNode: DiagramNode = { id: app.id, title: app.title, type: app.type, layer: -1, x: 0, y: currentY, w: NODE_W + 40, h: NODE_H + 8 };
  nodes.push(appNode);
  currentY += NODE_H + 8 + ROW_GAP;

  for (const [typeName, items] of sortedTypes) {
    const cfg = getConfig(typeName);
    const maxPerRow = 4;
    const rows = Math.ceil(items.length / maxPerRow);
    const cols = Math.min(items.length, maxPerRow);

    const layerW = cols * (NODE_W + COL_GAP) - COL_GAP + LAYER_PAD * 2;
    const layerH = rows * (NODE_H + COL_GAP) - COL_GAP + LAYER_PAD * 2 + HEADER_H + 8;
    const layerX = PAD;

    layerBoxes.push({
      label: cfg.label + ' (' + items.length + ')',
      color: cfg.color,
      headerBg: cfg.headerBg,
      x: layerX,
      y: currentY,
      w: layerW,
      h: layerH,
    });

    if (layerW + PAD * 2 > maxWidth) maxWidth = layerW + PAD * 2;

    // Place item nodes inside layer
    let col = 0;
    let row = 0;
    for (const item of items) {
      const nx = layerX + LAYER_PAD + col * (NODE_W + COL_GAP);
      const ny = currentY + HEADER_H + 8 + LAYER_PAD + row * (NODE_H + COL_GAP);
      nodes.push({ id: item.id, title: item.title, type: typeName, layer: cfg.order, x: nx, y: ny, w: NODE_W, h: NODE_H });
      edges.push({ sourceId: app.id, targetId: item.id, label: item.rel_name });

      col++;
      if (col >= maxPerRow) { col = 0; row++; }
    }

    currentY += layerH + 24;
  }

  // Center app node
  const totalW = Math.max(maxWidth, NODE_W + 40 + PAD * 2);
  appNode.x = (totalW - appNode.w) / 2;

  // Also center layer boxes
  for (const lb of layerBoxes) {
    lb.x = (totalW - lb.w) / 2;
  }

  // Recalculate node positions based on centered layers
  let layerIdx = 0;
  for (const [, items] of sortedTypes) {
    const lb = layerBoxes[layerIdx];
    let col = 0;
    let row = 0;
    const maxPerRow = 4;
    for (const item of items) {
      const node = nodes.find(n => n.id === item.id);
      if (node) {
        node.x = lb.x + LAYER_PAD + col * (NODE_W + COL_GAP);
        node.y = lb.y + HEADER_H + 8 + LAYER_PAD + row * (NODE_H + COL_GAP);
      }
      col++;
      if (col >= maxPerRow) { col = 0; row++; }
    }
    layerIdx++;
  }

  const totalH = currentY + PAD;

  // Build SVG
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW} ${totalH}" width="${totalW}" height="${totalH}" style="font-family:-apple-system,system-ui,sans-serif">`;

  // Defs: drop shadow + arrow marker
  svg += `<defs>
    <filter id="shadow" x="-4%" y="-4%" width="108%" height="116%">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#000" flood-opacity="0.3"/>
    </filter>
    <marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#4a5568"/>
    </marker>
  </defs>`;

  // Background
  svg += `<rect width="${totalW}" height="${totalH}" fill="#0f1117" rx="8"/>`;

  // Layer boxes
  for (const lb of layerBoxes) {
    svg += `<g filter="url(#shadow)">`;
    svg += `<rect x="${lb.x}" y="${lb.y}" width="${lb.w}" height="${lb.h}" rx="8" fill="#1a1d27" stroke="${lb.color}33" stroke-width="1"/>`;
    svg += `<rect x="${lb.x}" y="${lb.y}" width="${lb.w}" height="${HEADER_H}" rx="8" fill="${lb.headerBg}"/>`;
    svg += `<rect x="${lb.x}" y="${lb.y + HEADER_H - 4}" width="${lb.w}" height="4" fill="${lb.headerBg}"/>`;
    svg += `<text x="${lb.x + 10}" y="${lb.y + 16}" fill="#fff" font-size="11" font-weight="600">${escSvg(lb.label)}</text>`;
    svg += `</g>`;
  }

  // Edges (dashed lines from app to each layer center)
  for (const edge of edges) {
    const src = nodes.find(n => n.id === edge.sourceId);
    const tgt = nodes.find(n => n.id === edge.targetId);
    if (!src || !tgt) continue;

    const sx = src.x + src.w / 2;
    const sy = src.y + src.h;
    const tx = tgt.x + tgt.w / 2;
    const ty = tgt.y;

    svg += `<line x1="${sx}" y1="${sy}" x2="${tx}" y2="${ty}" stroke="#4a5568" stroke-width="1" stroke-dasharray="4,4" marker-end="url(#arrow)" opacity="0.4"/>`;
  }

  // App node (hero)
  const an = appNode;
  const appCfg = getConfig(an.type);
  svg += `<g filter="url(#shadow)">`;
  svg += `<rect x="${an.x}" y="${an.y}" width="${an.w}" height="${an.h}" rx="10" fill="${appCfg.headerBg}" stroke="${appCfg.color}" stroke-width="2"/>`;
  svg += `<text x="${an.x + an.w / 2}" y="${an.y + an.h / 2 - 6}" fill="#fff" font-size="14" font-weight="700" text-anchor="middle">${escSvg(an.title)}</text>`;
  svg += `<text x="${an.x + an.w / 2}" y="${an.y + an.h / 2 + 12}" fill="${appCfg.color}" font-size="10" text-anchor="middle">${escSvg(an.type)}</text>`;
  svg += `</g>`;

  // Item nodes
  for (const node of nodes) {
    if (node.id === appId) continue;
    const cfg = getConfig(node.type);
    const truncTitle = node.title.length > 22 ? node.title.slice(0, 20) + '...' : node.title;

    svg += `<g filter="url(#shadow)">`;
    svg += `<rect x="${node.x}" y="${node.y}" width="${node.w}" height="${node.h}" rx="6" fill="#1e2130" stroke="${cfg.color}66" stroke-width="1"/>`;
    svg += `<rect x="${node.x}" y="${node.y}" width="${node.w}" height="3" rx="6" fill="${cfg.color}"/>`;
    svg += `<text x="${node.x + 8}" y="${node.y + 22}" fill="#e1e4ed" font-size="11" font-weight="500">${escSvg(truncTitle)}</text>`;
    svg += `<text x="${node.x + 8}" y="${node.y + 38}" fill="#8b8fa3" font-size="9">${escSvg(node.type)}</text>`;
    svg += `</g>`;
  }

  svg += '</svg>';
  return svg;
}

function escSvg(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
