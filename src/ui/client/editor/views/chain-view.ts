/** ChainView — D3 collapsible tree with lazy loading and path highlighting. */
import { h } from 'preact';
import { html } from 'htm/preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import * as d3 from 'd3';

import { getGraph } from '../../shared/api-client.js';
import { navigateToObject } from '../../shared/state.js';
import { COLORS } from '../../shared/graph-constants.js';
import { buildChainTree } from './chain-tree-builder.js';
import type { ChainNode } from './chain-tree-builder.js';

interface CollapsibleNode extends d3.HierarchyPointNode<ChainNode> {
  _children?: CollapsibleNode[];
}

interface ChainPreset { id: string; label: string; types?: string[]; relations?: string[] }
const CHAIN_PRESETS: ChainPreset[] = [
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

const DX = 32, DY = 240, DURATION = 250;
const FONT = '-apple-system, Segoe UI, system-ui, sans-serif';

function countNodes(node: d3.HierarchyNode<ChainNode>): number {
  let c = 1;
  if (node.children) for (const ch of node.children) c += countNodes(ch);
  return c;
}

function collapse(d: CollapsibleNode): void {
  if (d.children) {
    d._children = d.children as CollapsibleNode[];
    d.children = undefined as unknown as CollapsibleNode[];
  }
}

function ancestors(d: d3.HierarchyPointNode<ChainNode>): Set<d3.HierarchyPointNode<ChainNode>> {
  const set = new Set<d3.HierarchyPointNode<ChainNode>>();
  let cur: d3.HierarchyPointNode<ChainNode> | null = d;
  while (cur) { set.add(cur); cur = cur.parent; }
  return set;
}

function renderChainTree(
  container: HTMLElement,
  rootData: ChainNode,
  onCountChange: (n: number) => void,
  activePreset: ChainPreset,
): void {
  container.innerHTML = '';
  const svgW = container.clientWidth || 900;
  const svgH = Math.max(450, container.clientHeight || 550);

  const root = d3.hierarchy(rootData) as CollapsibleNode;
  root.x0 = 0;
  root.y0 = 0;

  // Initial state: root expanded showing relation group labels, groups collapsed
  // Relation groups (depth 1, type _relation) have children but start collapsed
  root.each((d: d3.HierarchyNode<ChainNode>) => {
    const cn = d as CollapsibleNode;
    if (d.data.type === '_relation' && d.children) collapse(cn);
  });

  const layout = d3.tree<ChainNode>().nodeSize([DX, DY]);

  const svg = d3.select(container)
    .append('svg')
    .attr('width', '100%')
    .attr('height', svgH);

  const g = svg.append('g');
  const zoom = d3.zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.15, 3])
    .on('zoom', (ev) => g.attr('transform', ev.transform));
  svg.call(zoom);

  const linkGroup = g.append('g').attr('fill', 'none').attr('stroke', '#3a4a5a').attr('stroke-width', 1.5);
  const nodeGroup = g.append('g');

  // Do initial layout to compute positions before first render
  layout(root);
  root.each((d: d3.HierarchyPointNode<ChainNode>) => {
    const cn = d as CollapsibleNode;
    cn.x0 = d.x;
    cn.y0 = d.y;
  });
  update(root);

  function update(source: CollapsibleNode): void {
    layout(root);
    onCountChange(countNodes(root));
    const nodes = root.descendants() as CollapsibleNode[];
    const links = root.links();
    const link = linkGroup.selectAll<SVGPathElement, d3.HierarchyPointLink<ChainNode>>('path')
      .data(links, (d) => (d.target as CollapsibleNode).data.id);
    const linkEnter = link.enter().append('path')
      .attr('stroke-opacity', 0)
      .attr('d', () => linkPath({ y: source.y0 ?? 0, x: source.x0 ?? 0 }));
    link.merge(linkEnter).transition().duration(DURATION)
      .attr('stroke-opacity', 0.5)
      .attr('d', (d) => curvePath(d.source as CollapsibleNode, d.target as CollapsibleNode));
    link.exit().transition().duration(DURATION)
      .attr('stroke-opacity', 0)
      .attr('d', () => linkPath({ y: source.y ?? 0, x: source.x ?? 0 })).remove();
    const node = nodeGroup.selectAll<SVGGElement, CollapsibleNode>('g.chain-node')
      .data(nodes, (d) => d.data.id);

    const nodeEnter = node.enter().append('g')
      .attr('class', 'chain-node')
      .attr('transform', `translate(${source.y0 ?? 0},${source.x0 ?? 0})`)
      .attr('opacity', 0);

    // Draw node visuals on enter
    nodeEnter.each(function (d) {
      const el = d3.select(this);
      const isRel = d.data.type === '_relation' || d.data.type === '_overflow';
      const isRoot = d.depth === 0;

      if (isRel) {
        el.append('text')
          .text(d.data.title)
          .attr('text-anchor', 'middle').attr('dy', '0.35em')
          .attr('font-size', '10px').attr('font-style', 'italic')
          .attr('fill', '#8b8fa3').attr('font-family', FONT);
        return;
      }

      const label = d.data.title;
      const fs = isRoot ? 13 : 11;
      const tw = Math.min(label.length * fs * 0.62, 220);
      const px = 10; const py = 6;
      const rw = tw + px * 2; const rh = fs + py * 2;
      const color = COLORS[d.data.type] ?? '#555';

      el.append('rect')
        .attr('x', -rw / 2).attr('y', -rh / 2)
        .attr('width', rw).attr('height', rh).attr('rx', 5)
        .attr('fill', color)
        .attr('stroke', isRoot ? '#4f8ff7' : 'rgba(255,255,255,0.1)')
        .attr('stroke-width', isRoot ? 2.5 : 0.5);

      el.append('text')
        .text(label.length > 35 ? label.slice(0, 33) + '\u2026' : label)
        .attr('text-anchor', 'middle').attr('dy', '0.35em')
        .attr('font-size', `${fs}px`)
        .attr('font-weight', isRoot ? '600' : '400')
        .attr('fill', '#f0f0f0').attr('font-family', FONT);

      // Expand indicator
      if (d.data.expandable) {
        const hasKids = d.children || (d as CollapsibleNode)._children;
        el.append('text')
          .attr('class', 'expand-icon')
          .text(hasKids ? '\u25B6' : '\u25CB')
          .attr('x', rw / 2 + 6).attr('dy', '0.35em')
          .attr('font-size', '8px').attr('fill', '#8b8fa3');
      }
    });

    nodeEnter.attr('cursor', (d) => d.data.type === '_overflow' ? 'default' : 'pointer');
    nodeEnter.on('click', (_ev, d) => {
      if (d.data.type === '_overflow') return;
      handleClick(d);
    });
    nodeEnter.on('dblclick', (_ev, d) => {
      if (d.data.type !== '_relation' && d.data.type !== '_overflow') {
        navigateToObject(d.data.id, d.data.title, d.data.type);
      }
    });

    // Merge + transition
    const nodeUpdate = node.merge(nodeEnter);
    nodeUpdate.transition().duration(DURATION)
      .attr('transform', (d) => `translate(${d.y},${d.x})`)
      .attr('opacity', 1);

    node.exit()
      .transition().duration(DURATION)
      .attr('transform', `translate(${source.y},${source.x})`)
      .attr('opacity', 0)
      .remove();

    // Stash positions for next transition
    nodes.forEach((d) => { d.x0 = d.x; d.y0 = d.y; });
  }

  async function handleClick(d: CollapsibleNode): Promise<void> {
    if (d.children) {
      // Collapse
      collapse(d);
      update(d);
      return;
    }

    if (d._children) {
      // Expand already-loaded children
      d.children = d._children;
      d._children = undefined;
      update(d);
      return;
    }

    // Lazy load with active preset filter
    if (!d.data.loaded && d.data.expandable) {
      const graphData = await getGraph(d.data.id, 1, activePreset.types);
      const edges = activePreset.relations
        ? graphData.edges.filter(e => activePreset.relations!.includes(e.type))
        : graphData.edges;
      const subtree = buildChainTree(graphData.nodes, edges, d.data.id);
      d.data.loaded = true;
      d.data.children = subtree.children;

      if (subtree.children && subtree.children.length > 0) {
        // Rebuild hierarchy children from data
        const newKids = subtree.children.map((c) => {
          const child = d3.hierarchy(c) as CollapsibleNode;
          child.parent = d;
          child.depth = d.depth + 1;
          child.each((n) => { n.depth = d.depth + 1 + (n.depth); });
          return child;
        });
        d.children = newKids as unknown as CollapsibleNode[];
      }
      update(d);
    }
  }

  // Fit tree into viewport
  layout(root);
  let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
  root.each((d: d3.HierarchyPointNode<ChainNode>) => {
    if (d.x < xMin) xMin = d.x;
    if (d.x > xMax) xMax = d.x;
    if (d.y < yMin) yMin = d.y;
    if (d.y > yMax) yMax = d.y;
  });

  const treeW = (yMax - yMin) + 300;
  const treeH = (xMax - xMin) + 80;
  const scale = Math.min((svgW - 80) / Math.max(treeW, 1), (svgH - 80) / Math.max(treeH, 1), 1);
  const tx = 40 - yMin * scale;
  const ty = svgH / 2 - ((xMin + xMax) / 2) * scale;

  svg.call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
}

function curvePath(s: CollapsibleNode, t: CollapsibleNode): string {
  return `M${s.y},${s.x} C${(s.y + t.y) / 2},${s.x} ${(s.y + t.y) / 2},${t.x} ${t.y},${t.x}`;
}

function linkPath(p: { y: number; x: number }): string {
  return `M${p.y},${p.x} C${p.y},${p.x} ${p.y},${p.x} ${p.y},${p.x}`;
}

/** Preact component wrapping the D3 chain tree */
export function ChainView({ objectId, title }: { objectId: string; title: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [nodeCount, setNodeCount] = useState(0);
  const [activePreset, setActivePreset] = useState('all');

  useEffect(() => {
    if (!containerRef.current) return;
    setLoading(true);
    const preset = CHAIN_PRESETS.find(p => p.id === activePreset) ?? CHAIN_PRESETS[0];

    getGraph(objectId, 1, preset.types).then((data) => {
      if (!containerRef.current) return;
      const edges = preset.relations ? data.edges.filter(e => preset.relations!.includes(e.type)) : data.edges;
      const tree = buildChainTree(data.nodes, edges, objectId);
      renderChainTree(containerRef.current, tree, setNodeCount, preset);
      setLoading(false);
    });
  }, [objectId, activePreset]);

  return html`
    <div class="chain-view-container">
      ${loading && html`<div class="view-loading">Laden...</div>`}
      <div class="chain-presets" style="display:flex;gap:4px;padding:4px 8px">
        ${CHAIN_PRESETS.map(p => html`
          <button class="graph-preset-btn ${activePreset === p.id ? 'active' : ''}"
            style="font-size:11px;padding:2px 8px;border:1px solid #3a3d4a;background:${activePreset === p.id ? '#4f8ff7' : '#1e2128'};color:#e1e4ed;border-radius:4px;cursor:pointer"
            onClick=${() => setActivePreset(p.id)}>${p.label}</button>
        `)}
      </div>
      <div ref=${containerRef} class="chain-tree-svg" style="width:100%;height:100%;min-height:400px" />
      <div class="graph-info" style="padding:4px 8px;display:flex;justify-content:space-between">
        <span style="color:#8b8fa3;font-size:11px">klik om uit te vouwen, dubbelklik om te navigeren</span>
        ${nodeCount > 0 && html`<span>${nodeCount} objecten</span>`}
      </div>
    </div>
  `;
}
