# Ketenanalyse View — Interactieve Collapsible Tree

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Een interactieve, in- en uitklapbare boomvisualisatie waarmee gebruikers vanuit een applicatie (bijv. "Powerbrowser") downstream afhankelijkheden verkennen door infra- en datalagen heen.

**Architecture:** D3.js collapsible tidy tree met lazy loading per branch. Elke klik op een node laadt depth=1 relaties via de bestaande `/api/graph` API. Nodes zijn gegroepeerd per relatietype (niet per objecttype zoals de huidige tree). De view wordt een nieuw layout-type in de bestaande graph-view dropdown. Gedeelde constanten (COLORS, RELATION_LABELS) worden geextraheerd naar een shared module.

**Tech Stack:** D3.js v7 (al aanwezig), Preact + HTM, bestaande `/api/graph` endpoint.

---

## Bestandsstructuur

| Actie | Bestand | Verantwoordelijkheid |
|-------|---------|---------------------|
| Create | `src/ui/client/shared/graph-constants.ts` | Gedeelde COLORS, RELATION_LABELS, EDGE_STYLES |
| Create | `src/ui/client/editor/views/chain-tree-builder.ts` | Pure functies: `buildChainTree`, types (testbaar) |
| Create | `src/ui/client/editor/views/chain-view.ts` | Preact component + D3 renderer (~250 regels) |
| Modify | `src/ui/client/editor/views/graph-view.ts` | "Ketenanalyse" layout-optie + Cytoscape guard |
| Modify | `src/ui/client/editor/views/tidy-tree-view.ts` | Import COLORS/RELATION_LABELS uit shared |
| Modify | `src/ui/client/shared/api-client.ts` | Optionele `types`-filter op getGraph |
| Modify | `src/ui/api.ts` | `types`-queryparameter op `/api/graph` |
| Create | `tests/chain-tree-builder.test.ts` | Unit tests voor tree-building logica |
| Create | `tests/api-graph-types.test.ts` | Integratietest voor types-filter |

## Ontwerpbeslissingen

1. **Groeperen op relatietype** (niet objecttype): bij ketenanalyse wil je zien "waar hangt dit aan?" — composition, usedby, realization zijn de logische takken
2. **Lazy loading (depth=1 per klik)**: voorkomt dat de hele grafiek in één keer geladen wordt (sommige objecten hebben 100+ relaties)
3. **Visuele indicators**: gevulde cirkel = heeft kinderen (klikbaar), lege cirkel = blad
4. **Dubbelklik = navigeer**: opent het object in een nieuwe tab (via `navigateToObject`)
5. **Animaties**: 250ms transitions bij open/dicht, nodes verschijnen/verdwijnen vanuit parent-positie
6. **Eigen filter-presets**: wanneer ketenanalyse actief is worden de graph-view presetknoppen verborgen en verschijnen eigen keten-presets (Alles/Infra/Data/Processen)
7. **Typed D3 nodes**: `ChainHierarchyNode` interface i.p.v. `as any` casts

---

### Task 1: Shared graph constants extraheren

**Files:**
- Create: `src/ui/client/shared/graph-constants.ts`
- Modify: `src/ui/client/editor/views/tidy-tree-view.ts` (import i.p.v. lokale definitie)

- [ ] **Step 1: Maak shared constants bestand**

```typescript
// src/ui/client/shared/graph-constants.ts

/** WCAG AA contrast-safe colors: darker backgrounds with white text */
export const COLORS: Record<string, string> = {
  'Applicatie':            '#2b7ab5',
  'Applicatie-interface':  '#2b7ab5',
  'Applicatieservice':     '#3a8bc4',
  'Bedrijfsproces':        '#b8860b',
  'Bedrijfsfunctie':       '#b8860b',
  'Actor':                 '#c49a1a',
  'Bedrijfsservice':       '#b8860b',
  'Bedrijfsobject':        '#a07808',
  'Node':                  '#2a8a7a',
  'Netwerk':               '#2a8a7a',
  'Netwerk Device':        '#2a8a7a',
  'Apparaat':              '#2a8a7a',
  'Database':              '#1d7a6a',
  'Technologie-interface': '#368f80',
  'Technologieservice':    '#368f80',
  'Locatie':               '#c4453a',
  'Package':               '#5a8c2a',
  'Gegevensobject':        '#c47a20',
  'Referentiecomponent':   '#6b5b95',
  'Selectielijst':         '#708090',
  'Domein':                '#556b7a',
};

export const RELATION_LABELS: Record<string, string> = {
  usedby: 'Gebruikt door',
  flow: 'Gegevensstromen',
  realization: 'Realisatie',
  access: 'Benadert',
  association: 'Associaties',
  assignment: 'Toegewezen aan',
  composition: 'Onderdeel van',
  aggregation: 'Groepeert',
  specialization: 'Specialisatie',
  serving: 'Bedient',
};
```

- [ ] **Step 2: Update tidy-tree-view.ts om uit shared te importeren**

Vervang de lokale `COLORS` en `RELATION_LABELS` definities door:
```typescript
import { COLORS, RELATION_LABELS } from '../../shared/graph-constants.js';
```

- [ ] **Step 3: Verify build compileert**

Run: `node build.mjs`
Expected: `Client bundle built: dist/client.js`

- [ ] **Step 4: Commit**

```bash
git add src/ui/client/shared/graph-constants.ts src/ui/client/editor/views/tidy-tree-view.ts
git commit -m "refactor: extract shared COLORS and RELATION_LABELS to graph-constants"
```

---

### Task 2: Tree-building logica (pure functies, testbaar)

**Files:**
- Create: `src/ui/client/editor/views/chain-tree-builder.ts`
- Create: `tests/chain-tree-builder.test.ts`

- [ ] **Step 1: Schrijf failing tests voor `buildChainTree`**

```typescript
// tests/chain-tree-builder.test.ts
import { describe, it, expect } from 'vitest';
import { buildChainTree } from '../src/ui/client/editor/views/chain-tree-builder.js';

describe('buildChainTree', () => {
  it('should group children by relation type', () => {
    const nodes = [
      { id: 'root', title: 'Powerbrowser', type: 'Applicatie' },
      { id: 'n1', title: 'SRV-01', type: 'Node' },
      { id: 'n2', title: 'DB-01', type: 'Database' },
      { id: 'n3', title: 'Zaakafhandeling', type: 'Bedrijfsproces' },
    ];
    const edges = [
      { source: 'root', target: 'n1', label: '', type: 'composition' },
      { source: 'root', target: 'n2', label: '', type: 'access' },
      { source: 'n3', target: 'root', label: '', type: 'usedby' },
    ];

    const tree = buildChainTree(nodes, edges, 'root');

    expect(tree.id).toBe('root');
    expect(tree.title).toBe('Powerbrowser');
    expect(tree.children).toHaveLength(3);
    const relTypes = tree.children!.map(c => c.relationType);
    expect(relTypes).toContain('composition');
    expect(relTypes).toContain('access');
    expect(relTypes).toContain('usedby');
  });

  it('should mark leaf nodes as expandable (unknown children)', () => {
    const nodes = [
      { id: 'root', title: 'App', type: 'Applicatie' },
      { id: 'n1', title: 'Server', type: 'Node' },
    ];
    const edges = [
      { source: 'root', target: 'n1', label: '', type: 'composition' },
    ];

    const tree = buildChainTree(nodes, edges, 'root');
    const leaf = tree.children![0].children![0];
    expect(leaf.expandable).toBe(true);
    expect(leaf.loaded).toBe(false);
  });

  it('should wrap single relation type in group node', () => {
    const nodes = [
      { id: 'root', title: 'App', type: 'Applicatie' },
      { id: 'n1', title: 'Server', type: 'Node' },
    ];
    const edges = [
      { source: 'root', target: 'n1', label: '', type: 'composition' },
    ];

    const tree = buildChainTree(nodes, edges, 'root');
    expect(tree.children).toHaveLength(1);
    expect(tree.children![0].relationType).toBe('composition');
    expect(tree.children![0].children).toHaveLength(1);
  });

  it('should return childless root for empty graph', () => {
    const tree = buildChainTree(
      [{ id: 'root', title: 'Lonely', type: 'Applicatie' }],
      [],
      'root',
    );
    expect(tree.children).toHaveLength(0);
    expect(tree.expandable).toBe(false);
  });

  it('should ignore self-referencing edges', () => {
    const nodes = [
      { id: 'root', title: 'App', type: 'Applicatie' },
    ];
    const edges = [
      { source: 'root', target: 'root', label: '', type: 'association' },
    ];

    const tree = buildChainTree(nodes, edges, 'root');
    expect(tree.children).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test, verify failure**

Run: `npx vitest run tests/chain-tree-builder.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `buildChainTree`**

```typescript
// src/ui/client/editor/views/chain-tree-builder.ts
import { RELATION_LABELS } from '../../shared/graph-constants.js';

export interface ChainNode {
  id: string;
  title: string;
  type: string;
  relationType?: string;
  expandable: boolean;
  loaded: boolean;
  children?: ChainNode[];
}

/** Extended D3 hierarchy node with collapse/expand state */
export interface ChainHierarchyNode extends d3.HierarchyPointNode<ChainNode> {
  _children?: ChainHierarchyNode[];
  _id: number;
  x0: number;
  y0: number;
}

interface GNode { id: string; title: string; type: string }
interface GEdge { source: string; target: string; label: string; type: string }

export function buildChainTree(
  nodes: GNode[],
  edges: GEdge[],
  rootId: string,
): ChainNode {
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const rootNode = nodeMap.get(rootId);

  const groups = new Map<string, GNode[]>();
  for (const e of edges) {
    const otherId = e.source === rootId ? e.target : e.source;
    if (otherId === rootId) continue;
    const other = nodeMap.get(otherId);
    if (!other) continue;
    if (!groups.has(e.type)) groups.set(e.type, []);
    groups.get(e.type)!.push(other);
  }

  const sorted = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);

  const children: ChainNode[] = sorted.map(([relType, groupNodes]) => ({
    id: `_rel_${rootId}_${relType}`,
    title: RELATION_LABELS[relType] ?? relType,
    type: '_relation',
    relationType: relType,
    expandable: false,
    loaded: true,
    children: groupNodes.map(n => ({
      id: n.id,
      title: n.title,
      type: n.type,
      expandable: true,
      loaded: false,
    })),
  }));

  return {
    id: rootId,
    title: rootNode?.title ?? rootId,
    type: rootNode?.type ?? '',
    expandable: children.length > 0,
    loaded: true,
    children,
  };
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run tests/chain-tree-builder.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/ui/client/editor/views/chain-tree-builder.ts tests/chain-tree-builder.test.ts
git commit -m "feat: add buildChainTree logic for chain analysis view"
```

---

### Task 3: D3 collapsible tree renderer + Preact component

**Files:**
- Create: `src/ui/client/editor/views/chain-view.ts`

Dit bestand bevat de `renderChainTree` D3-functie en de `ChainView` Preact-component (~250 regels).

- [ ] **Step 1: Schrijf chain-view.ts met renderer en component**

Kernpunten:
- Import `ChainNode`, `ChainHierarchyNode`, `buildChainTree` uit `chain-tree-builder.js`
- Import `COLORS` uit `graph-constants.js`
- Gebruik `ChainHierarchyNode` interface voor alle D3 node referenties (geen `as any`)
- `renderChainTree(container, rootData, onExpand)`: D3 collapsible tree
- `ChainView({ objectId, title })`: Preact wrapper met lazy loading

```typescript
// src/ui/client/editor/views/chain-view.ts
import { h } from 'preact';
import { html } from 'htm/preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import * as d3 from 'd3';

import { getGraph } from '../../shared/api-client.js';
import { navigateToObject } from '../../shared/state.js';
import { COLORS } from '../../shared/graph-constants.js';
import { buildChainTree } from './chain-tree-builder.js';
import type { ChainNode, ChainHierarchyNode } from './chain-tree-builder.js';

const CHAIN_COLORS: Record<string, string> = { ...COLORS, '_relation': 'transparent' };
const DX = 32;
const DY = 240;
const DURATION = 250;

function renderChainTree(
  container: HTMLElement,
  rootData: ChainNode,
  onExpand: (node: ChainNode) => Promise<void>,
): void {
  container.innerHTML = '';
  const svgW = container.clientWidth || 800;
  const svgH = container.clientHeight || 600;

  const svg = d3.select(container).append('svg')
    .attr('width', '100%').attr('height', svgH);
  const g = svg.append('g');

  const zoom = d3.zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.15, 3])
    .on('zoom', (e) => g.attr('transform', e.transform));
  svg.call(zoom);

  const layout = d3.tree<ChainNode>().nodeSize([DX, DY]);
  const root = d3.hierarchy(rootData) as ChainHierarchyNode;
  root.x0 = 0;
  root.y0 = 0;

  let idSeq = 0;
  root.descendants().forEach((d) => {
    const node = d as ChainHierarchyNode;
    node._id = idSeq++;
    // Collapse depth > 1 initially
    if (node.depth > 1 && node.children) {
      node._children = node.children as ChainHierarchyNode[];
      node.children = undefined as unknown as ChainHierarchyNode[];
    }
  });

  function diagonal(s: { x: number; y: number }, t: { x: number; y: number }): string {
    return `M${s.y},${s.x} C${(s.y + t.y) / 2},${s.x} ${(s.y + t.y) / 2},${t.x} ${t.y},${t.x}`;
  }

  function update(source: ChainHierarchyNode) {
    layout(root);
    const nodes = root.descendants() as ChainHierarchyNode[];
    const links = root.links();

    // --- NODES ---
    const nodeSel = g.selectAll<SVGGElement, ChainHierarchyNode>('g.chain-node')
      .data(nodes, (d) => d._id);

    const enter = nodeSel.enter().append('g')
      .attr('class', 'chain-node')
      .attr('transform', `translate(${source.y0},${source.x0})`)
      .attr('opacity', 0);

    enter.append('circle').attr('r', 5).attr('cx', -12);
    enter.append('rect').attr('class', 'label-bg');
    enter.append('text').attr('dy', '0.35em')
      .attr('font-family', '-apple-system, Segoe UI, system-ui, sans-serif');

    // Click: expand/collapse
    enter.on('click', async (_e, d) => {
      if (d.data.type === '_relation') return;
      if (d.data.expandable && !d.data.loaded) {
        await onExpand(d.data);
        // Refresh hierarchy from mutated data
        const fresh = d3.hierarchy(rootData) as ChainHierarchyNode;
        root.children = fresh.children as ChainHierarchyNode[];
        root.data = fresh.data;
        root.descendants().forEach((n) => {
          const node = n as ChainHierarchyNode;
          if (!node._id) node._id = idSeq++;
        });
        update(d);
        return;
      }
      if (d._children) {
        d.children = d._children;
        d._children = undefined;
      } else if (d.children) {
        d._children = d.children as ChainHierarchyNode[];
        d.children = undefined as unknown as ChainHierarchyNode[];
      }
      update(d);
    });

    // Dubbelklik: navigeer
    enter.on('dblclick', (_e, d) => {
      if (d.data.type !== '_relation') {
        navigateToObject(d.data.id, d.data.title, d.data.type);
      }
    });

    const merged = enter.merge(nodeSel);
    merged.transition().duration(DURATION)
      .attr('transform', d => `translate(${d.y},${d.x})`)
      .attr('opacity', 1);

    // Circle style
    merged.select('circle')
      .attr('fill', d => {
        if (d.data.type === '_relation') return 'none';
        return (d.children || d._children) ? (CHAIN_COLORS[d.data.type] ?? '#555') : '#999';
      })
      .attr('stroke', d => d.data.type === '_relation' ? 'none' : '#fff')
      .attr('stroke-width', 1);

    // Text
    merged.select('text')
      .text(d => d.data.title.length > 40 ? d.data.title.slice(0, 38) + '...' : d.data.title)
      .attr('font-size', d => d.data.type === '_relation' ? '10px' : '11px')
      .attr('font-style', d => d.data.type === '_relation' ? 'italic' : 'normal')
      .attr('font-weight', d => d.depth === 0 ? '600' : '400')
      .attr('fill', d => d.data.type === '_relation' ? '#8b8fa3' : '#f0f0f0')
      .attr('cursor', d => d.data.type === '_relation' ? 'default' : 'pointer');

    // Rect achter text
    merged.each(function(d) {
      const textEl = d3.select(this).select('text').node() as SVGTextElement;
      if (!textEl) return;
      const bbox = textEl.getBBox();
      const isRel = d.data.type === '_relation';
      d3.select(this).select('rect.label-bg')
        .attr('x', bbox.x - 6).attr('y', bbox.y - 3)
        .attr('width', bbox.width + 12).attr('height', bbox.height + 6)
        .attr('rx', 4)
        .attr('fill', isRel ? 'transparent' : (CHAIN_COLORS[d.data.type] ?? '#555'))
        .attr('stroke', d.depth === 0 ? '#4f8ff7' : 'none')
        .attr('stroke-width', d.depth === 0 ? 2 : 0);
    });

    // Hover: highlight pad naar root
    merged.on('mouseenter', (_e, d) => {
      const path = new Set(d.ancestors().map(a => (a as ChainHierarchyNode)._id));
      g.selectAll<SVGGElement, ChainHierarchyNode>('g.chain-node')
        .attr('opacity', n => path.has(n._id) ? 1 : 0.2);
      g.selectAll<SVGPathElement, d3.HierarchyLink<ChainNode>>('path.chain-link')
        .attr('stroke-opacity', l => path.has((l.target as ChainHierarchyNode)._id) ? 1 : 0.1);
    });
    merged.on('mouseleave', () => {
      g.selectAll('g.chain-node').attr('opacity', 1);
      g.selectAll('path.chain-link').attr('stroke-opacity', 0.5);
    });

    // Exit
    nodeSel.exit().transition().duration(DURATION)
      .attr('transform', `translate(${source.y},${source.x})`)
      .attr('opacity', 0).remove();

    // --- LINKS ---
    const linkSel = g.selectAll<SVGPathElement, d3.HierarchyLink<ChainNode>>('path.chain-link')
      .data(links, (d) => (d.target as ChainHierarchyNode)._id);

    const linkEnter = linkSel.enter().insert('path', 'g')
      .attr('class', 'chain-link')
      .attr('d', () => diagonal({ x: source.x0, y: source.y0 }, { x: source.x0, y: source.y0 }))
      .attr('fill', 'none').attr('stroke', '#3a4a5a')
      .attr('stroke-width', 1.5).attr('stroke-opacity', 0.5);

    linkEnter.merge(linkSel).transition().duration(DURATION)
      .attr('d', d => diagonal(d.source, d.target));

    linkSel.exit().transition().duration(DURATION)
      .attr('d', () => diagonal({ x: source.x, y: source.y }, { x: source.x, y: source.y }))
      .remove();

    // Bewaar posities
    nodes.forEach(d => { d.x0 = d.x; d.y0 = d.y; });
  }

  update(root);
  svg.call(zoom.transform, d3.zoomIdentity.translate(60, svgH / 2));
}

// --- PREACT COMPONENT ---

export function ChainView({ objectId, title }: { objectId: string; title: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [nodeCount, setNodeCount] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return;
    setLoading(true);

    getGraph(objectId, 1).then(data => {
      if (!containerRef.current) return;
      const tree = buildChainTree(data.nodes, data.edges, objectId);
      setNodeCount(data.nodes.length);

      renderChainTree(containerRef.current, tree, async (node) => {
        const childData = await getGraph(node.id, 1);
        const childTree = buildChainTree(childData.nodes, childData.edges, node.id);
        node.children = childTree.children;
        node.loaded = true;
        node.expandable = (childTree.children?.length ?? 0) > 0;
        setNodeCount(prev => prev + childData.nodes.length - 1);
      });

      setLoading(false);
    });
  }, [objectId]);

  return html`
    <div class="chain-view-container" style="width:100%;height:100%">
      ${loading && html`<div class="view-loading">Ketenanalyse laden...</div>`}
      <div ref=${containerRef} style="width:100%;height:100%" />
      ${nodeCount > 0 && html`
        <div class="graph-info" style="padding:4px 8px;font-size:11px;color:#8b8fa3">
          ${nodeCount} objecten — klik om uit te vouwen, dubbelklik om te navigeren
        </div>
      `}
    </div>
  `;
}
```

- [ ] **Step 2: Verify build compileert**

Run: `node build.mjs`
Expected: `Client bundle built: dist/client.js`

- [ ] **Step 3: Commit**

```bash
git add src/ui/client/editor/views/chain-view.ts
git commit -m "feat: add ChainView component with D3 collapsible tree and lazy loading"
```

---

### Task 4: Integratie in graph-view als layout-optie

**Files:**
- Modify: `src/ui/client/editor/views/graph-view.ts`

- [ ] **Step 1: Update LayoutType union en imports**

```typescript
// graph-view.ts regel 6 (bij imports):
import { ChainView } from './chain-view.js';

// graph-view.ts regel 108:
// WAS:  type LayoutType = 'tidytree' | 'dagre' | 'concentric' | 'cose';
// WORDT:
type LayoutType = 'tidytree' | 'dagre' | 'concentric' | 'cose' | 'chain';

// graph-view.ts regel 110-115 (LAYOUT_OPTIONS array, voeg toe):
{ id: 'chain', label: 'Ketenanalyse' },
```

- [ ] **Step 2: Cytoscape useEffect guard updaten**

```typescript
// graph-view.ts regel 124-125:
// WAS:  const isTidyTree = layoutType === 'tidytree';
// WORDT:
const isTidyTree = layoutType === 'tidytree';
const isChain = layoutType === 'chain';
const skipCytoscape = isTidyTree || isChain;

// graph-view.ts regel 130:
// WAS:  if (isTidyTree) return;
// WORDT:
if (skipCytoscape) return;
```

- [ ] **Step 3: Render ChainView in template + verberg preset-knoppen**

```typescript
// graph-view.ts rond regel 355-367, de render sectie:
// WAS:
//   ${isTidyTree ? html`<${TidyTreeView} ... />` : html`...`}
// WORDT:
${isChain ? html`
  <${ChainView} objectId=${objectId} title=${title} />
` : isTidyTree ? html`
  <${TidyTreeView}
    objectId=${objectId} title=${title}
    depth=${preset.depth}
    allowedTypes=${preset.allowedTypes}
    allowedRelations=${preset.allowedRelations}
    maxNodes=${preset.maxNodes}
  />
` : html`
  ${loading && html`<div class="view-loading">Laden...</div>`}
  <div ref=${containerRef} class="cy-graph" />
`}

// Verberg preset-knoppen wanneer chain actief:
// In de graph-controls div, wrap de preset selector:
${!isChain && html`
  <div class="graph-view-selector">
    ${GRAPH_PRESETS.map(p => html`...`)}
  </div>
`}
```

- [ ] **Step 4: Build, herstart server, test in browser**

Run: `node build.mjs`

Test: Open een applicatie, selecteer "Ketenanalyse" layout.
- Verwacht: root node met relatietype-takken, klikbaar om uit te vouwen
- Verwacht: preset-knoppen verdwijnen, alleen layout-dropdown zichtbaar
- Verwacht: geen Cytoscape achtergrondlading

- [ ] **Step 5: Commit**

```bash
git add src/ui/client/editor/views/graph-view.ts
git commit -m "feat: integrate chain analysis as layout option in graph view"
```

---

### Task 5: API verbetering — `types` filter op `/api/graph`

**Files:**
- Modify: `src/ui/api.ts`
- Modify: `src/ui/client/shared/api-client.ts`
- Create: `tests/api-graph-types.test.ts`

- [ ] **Step 1: Schrijf integratietest voor types-filter**

```typescript
// tests/api-graph-types.test.ts
import { describe, it, expect } from 'vitest';

describe('/api/graph types filter', () => {
  const BASE = 'http://localhost:3002';

  it('should filter nodes by type when types param given', async () => {
    // Gebruik een bekend object-id uit de DB
    const allRes = await fetch(`${BASE}/api/graph?id=TEST_ID&depth=1`);
    const all = await allRes.json();

    const filteredRes = await fetch(`${BASE}/api/graph?id=TEST_ID&depth=1&types=Node,Database`);
    const filtered = await filteredRes.json();

    // Root node altijd aanwezig, gefilterde set is kleiner of gelijk
    expect(filtered.nodes.length).toBeLessThanOrEqual(all.nodes.length);
    // Alle niet-root nodes moeten van type Node of Database zijn
    for (const n of filtered.nodes) {
      if (n.id !== 'TEST_ID') {
        expect(['Node', 'Database']).toContain(n.type);
      }
    }
  });

  it('should return all nodes when no types param', async () => {
    const res = await fetch(`${BASE}/api/graph?id=TEST_ID&depth=1`);
    const data = await res.json();
    expect(data.nodes.length).toBeGreaterThan(0);
  });
});
```

**Let op:** `TEST_ID` moet vervangen worden door een echt object-ID uit de database (bijv. het Powerbrowser ID).

- [ ] **Step 2: Voeg `types` queryparameter toe aan `/api/graph`**

In `api.ts`, bij de graph endpoint handler:
```typescript
const typesParam = req.query.types as string | undefined;
const typeFilter = typesParam ? new Set(typesParam.split(',')) : null;

// In de expand/traverse functie, bij het toevoegen van nodes:
// if (typeFilter && !typeFilter.has(node.type) && node.id !== rootId) continue;
```

Root node wordt altijd meegenomen, ongeacht filter.

- [ ] **Step 3: Update `getGraph` in api-client.ts**

```typescript
export async function getGraph(id: string, depth = 1, types?: string[]): Promise<GraphData> {
  const params = new URLSearchParams({ id, depth: String(depth) });
  if (types?.length) params.set('types', types.join(','));
  const res = await fetch(`${BASE}/api/graph?${params}`);
  return res.json();
}
```

- [ ] **Step 4: Test met curl**

Run: `curl -s "http://localhost:3002/api/graph?id=<powerbrowser-id>&depth=1&types=Node,Database" | npx tsx -e "..."`
Expected: Alleen Node en Database types in response (plus root)

- [ ] **Step 5: Commit**

```bash
git add src/ui/api.ts src/ui/client/shared/api-client.ts tests/api-graph-types.test.ts
git commit -m "feat: add types filter to /api/graph endpoint"
```

---

### Task 6: Ketenfilter-presets (infra vs data vs alles)

**Files:**
- Modify: `src/ui/client/editor/views/chain-view.ts`

- [ ] **Step 1: Voeg CHAIN_PRESETS en filter-knoppen toe aan ChainView**

```typescript
const CHAIN_PRESETS: Array<{ id: string; label: string; types?: string[]; relations?: string[] }> = [
  { id: 'all', label: 'Alles' },
  { id: 'infra', label: 'Infrastructuur',
    types: ['Node', 'Database', 'Netwerk', 'Netwerk Device', 'Apparaat', 'Locatie', 'Package'],
    relations: ['composition', 'realization', 'association'] },
  { id: 'data', label: 'Datastromen',
    types: ['Database', 'Gegevensobject', 'Applicatie-interface', 'Applicatieservice'],
    relations: ['flow', 'access'] },
  { id: 'process', label: 'Processen',
    types: ['Bedrijfsproces', 'Bedrijfsfunctie', 'Actor', 'Bedrijfsobject'],
    relations: ['usedby', 'aggregation', 'assignment'] },
];
```

Update `ChainView` met:
- `useState` voor `activePreset`
- Filter-knoppen boven de tree
- Bij preset-wissel: `getGraph` opnieuw aanroepen met `types` parameter en herbouwen

- [ ] **Step 2: Build en test presets in browser**

Run: `node build.mjs`
Test: Wissel tussen Infra/Data/Processen/Alles — boom herbouwt met gefilterde data.

- [ ] **Step 3: Commit**

```bash
git add src/ui/client/editor/views/chain-view.ts
git commit -m "feat: add chain analysis filter presets (infra, data, process)"
```

---

## Samenvatting

| Task | Wat | Doel |
|------|-----|------|
| 1 | Shared graph constants | DRY: COLORS/RELATION_LABELS op 1 plek |
| 2 | Tree-building logica + tests | Testbare kern zonder UI-afhankelijkheid |
| 3 | D3 renderer + Preact component | Interactieve collapsible tree met lazy loading |
| 4 | graph-view integratie | Layout-dropdown + Cytoscape guard + preset hiding |
| 5 | API types-filter + test | Server-side filtering voor performance |
| 6 | Keten-presets | Infra/Data/Processen/Alles filter-knoppen |

**Na afronding kan een gebruiker:**
1. Een applicatie openen (bijv. via AI chat: "email probleem" → Exchange)
2. Layout "Ketenanalyse" selecteren
3. Zien hoe Exchange verbonden is: infra (servers, netwerken), data (databases), processen
4. Klikken om dieper te navigeren door de keten
5. Filteren op infra/data/processen
6. Pad-highlighting gebruiken om de keten van root naar blad te volgen
