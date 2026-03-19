/**
 * D3.js Tidy Tree — horizontal tree layout (Reingold-Tilford)
 * Root left, relations fanning out to the right.
 * Static, no physics, clean and readable.
 */
import { h } from 'preact';
import { html } from 'htm/preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import * as d3 from 'd3';

import { getGraph } from '../../shared/api-client.js';
import { navigateToObject } from '../../shared/state.js';
import { COLORS, RELATION_LABELS } from '../../shared/graph-constants.js';

interface GNode {
  id: string;
  title: string;
  type: string;
}

interface GEdge {
  source: string;
  target: string;
  label: string;
  type: string;
}

interface TreeNode {
  id: string;
  title: string;
  type: string;
  children?: TreeNode[];
}

export function TidyTreeView({ objectId, title, depth, allowedTypes, allowedRelations, maxNodes }: {
  objectId: string;
  title: string;
  depth: number;
  allowedTypes: Set<string>;
  allowedRelations: Set<string>;
  maxNodes: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [nodeCount, setNodeCount] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return;
    setLoading(true);

    // Tidy tree benefits from depth=2 to create meaningful branches
    const treeDepth = Math.max(depth, 2);
    getGraph(objectId, treeDepth).then(data => {
      if (!containerRef.current) return;

      // Filter
      const hidden = new Set(['Technologie-interface']);
      let nodes = data.nodes.filter(n => !hidden.has(n.type) && allowedTypes.has(n.type));
      const root = data.nodes.find(n => n.id === objectId);
      if (root && !nodes.find(n => n.id === objectId)) nodes.unshift(root);

      const nodeIds = new Set(nodes.map(n => n.id));
      const edgeSet = new Set<string>();
      let edges = data.edges.filter(e => {
        if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) return false;
        if (!allowedRelations.has(e.type)) return false;
        const key = [e.source, e.target].sort().join('-');
        if (edgeSet.has(key)) return false;
        edgeSet.add(key);
        return true;
      });

      // Cap
      if (nodes.length > maxNodes) {
        const ec = new Map<string, number>();
        for (const e of edges) {
          ec.set(e.source, (ec.get(e.source) ?? 0) + 1);
          ec.set(e.target, (ec.get(e.target) ?? 0) + 1);
        }
        nodes.sort((a, b) => {
          if (a.id === objectId) return -1;
          if (b.id === objectId) return 1;
          return (ec.get(b.id) ?? 0) - (ec.get(a.id) ?? 0);
        });
        nodes = nodes.slice(0, maxNodes);
        const kept = new Set(nodes.map(n => n.id));
        edges = edges.filter(e => kept.has(e.source) && kept.has(e.target));
      }

      setNodeCount(nodes.length);
      renderTidyTree(containerRef.current, nodes, edges, objectId);
      setLoading(false);
    });
  }, [objectId, depth, allowedTypes, allowedRelations, maxNodes]);

  return html`
    <div class="tidy-tree-container">
      ${loading && html`<div class="view-loading">Laden...</div>`}
      <div ref=${containerRef} class="tidy-tree-svg" />
      ${nodeCount > 0 && html`<div class="graph-info" style="padding:4px 0">${nodeCount} objecten</div>`}
    </div>
  `;
}

function buildTree(nodes: GNode[], edges: GEdge[], rootId: string): TreeNode {
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const rootNode = nodeMap.get(rootId);
  const nonRoot = nodes.filter(n => n.id !== rootId);

  // Group ALL non-root nodes by object type → flat tree with branches
  const groups = new Map<string, GNode[]>();
  for (const n of nonRoot) {
    if (!groups.has(n.type)) groups.set(n.type, []);
    groups.get(n.type)!.push(n);
  }

  // Sort groups by size (largest first)
  const sortedGroups = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);

  const branches: TreeNode[] = [];
  for (const [objType, groupNodes] of sortedGroups) {
    const leaves: TreeNode[] = groupNodes.map(n => ({
      id: n.id, title: n.title, type: n.type,
    }));

    if (leaves.length === 1) {
      branches.push(leaves[0]);
      continue;
    }

    branches.push({
      id: `_group_${objType}`,
      title: `${objType} (${leaves.length})`,
      type: '_group',
      children: leaves,
    });
  }

  return {
    id: rootId,
    title: rootNode?.title ?? rootId,
    type: rootNode?.type ?? '',
    ...(branches.length > 0 ? { children: branches } : {}),
  };
}

function renderTidyTree(container: HTMLElement, nodes: GNode[], edges: GEdge[], rootId: string): void {
  container.innerHTML = '';
  if (nodes.length === 0) {
    container.innerHTML = '<div style="color:#8b8fa3;padding:32px;text-align:center">Geen objecten</div>';
    return;
  }

  const treeData = buildTree(nodes, edges, rootId);
  const root = d3.hierarchy(treeData);

  // Use nodeSize for precise control, then compute extent
  const dx = 28; // vertical spacing between nodes
  const dy = 220; // horizontal spacing between depth levels
  const layout = d3.tree<TreeNode>().nodeSize([dx, dy]);
  layout(root);

  // Compute bounding box
  let x0 = Infinity, x1 = -Infinity;
  root.each((d: d3.HierarchyPointNode<TreeNode>) => {
    if (d.x < x0) x0 = d.x;
    if (d.x > x1) x1 = d.x;
  });

  const svgWidth = container.clientWidth || 800;
  const svgHeight = Math.max(400, container.clientHeight || 500);

  const svg = d3.select(container)
    .append('svg')
    .attr('width', '100%')
    .attr('height', svgHeight)
    .attr('viewBox', `0 0 ${svgWidth} ${svgHeight}`);

  // Zoom + pan
  const g = svg.append('g');
  const zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.2, 3])
    .on('zoom', (event) => { g.attr('transform', event.transform); });
  svg.call(zoomBehavior);

  // Links — smooth horizontal curves
  g.selectAll('path.link')
    .data(root.links())
    .join('path')
    .attr('class', 'link')
    .attr('d', d => {
      const s = d.source as d3.HierarchyPointNode<TreeNode>;
      const t = d.target as d3.HierarchyPointNode<TreeNode>;
      // Horizontal tree: x=depth (horizontal), y=breadth (vertical)
      return `M${s.y},${s.x} C${(s.y + t.y) / 2},${s.x} ${(s.y + t.y) / 2},${t.x} ${t.y},${t.x}`;
    })
    .attr('fill', 'none')
    .attr('stroke', '#3a4a5a')
    .attr('stroke-width', 1.5)
    .attr('stroke-opacity', 0.6);

  // Nodes
  const node = g.selectAll('g.node')
    .data(root.descendants())
    .join('g')
    .attr('class', 'node')
    .attr('transform', d => {
      const p = d as d3.HierarchyPointNode<TreeNode>;
      return `translate(${p.y},${p.x})`;
    })
    .attr('cursor', d => d.data.type === '_group' ? 'default' : 'pointer')
    .on('click', (_e, d) => {
      if (d.data.type !== '_group') {
        navigateToObject(d.data.id, d.data.title, d.data.type);
      }
    });

  // Node rectangles — sized to text
  node.each(function(d) {
    const el = d3.select(this);
    const isRoot = d.data.id === rootId;
    const isGroup = d.data.type === '_group';
    const label = d.data.title;

    if (isGroup) {
      // Group nodes: subtle label style, no box
      el.append('text')
        .text(label)
        .attr('text-anchor', 'middle')
        .attr('dy', '0.35em')
        .attr('font-size', '10px')
        .attr('font-weight', '600')
        .attr('fill', '#8b8fa3')
        .attr('font-style', 'italic')
        .attr('font-family', '-apple-system, Segoe UI, system-ui, sans-serif');
      return;
    }

    const color = COLORS[d.data.type] ?? '#555';
    const textColor = '#f0f0f0'; // White text on all dark WCAG backgrounds

    // Estimate text width (rough: 7px per char at 12px font)
    const fontSize = isRoot ? 13 : 11;
    const charWidth = fontSize * 0.62;
    const textWidth = Math.min(label.length * charWidth, 220);
    const padX = 10;
    const padY = 6;
    const rectW = textWidth + padX * 2;
    const rectH = fontSize + padY * 2;

    el.append('rect')
      .attr('x', -rectW / 2)
      .attr('y', -rectH / 2)
      .attr('width', rectW)
      .attr('height', rectH)
      .attr('rx', 5)
      .attr('fill', color)
      .attr('stroke', isRoot ? '#4f8ff7' : 'rgba(255,255,255,0.1)')
      .attr('stroke-width', isRoot ? 2.5 : 0.5);

    el.append('text')
      .text(label.length > 35 ? label.slice(0, 33) + '…' : label)
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('font-size', `${fontSize}px`)
      .attr('font-weight', isRoot ? '600' : '400')
      .attr('fill', textColor)
      .attr('font-family', '-apple-system, Segoe UI, system-ui, sans-serif');
  });

  // Fit entire tree into viewport
  let yMin = Infinity, yMax = -Infinity;
  root.each((d: d3.HierarchyPointNode<TreeNode>) => {
    if (d.y < yMin) yMin = d.y;
    if (d.y > yMax) yMax = d.y;
  });

  const treeW = (yMax - yMin) + 260; // horizontal extent + label padding
  const treeH = (x1 - x0) + 60;      // vertical extent + padding
  const pad = 40;
  const scale = Math.min(
    (svgWidth - pad * 2) / Math.max(treeW, 1),
    (svgHeight - pad * 2) / Math.max(treeH, 1),
    1,
  );
  const tx = pad - yMin * scale;
  const ty = svgHeight / 2 - ((x0 + x1) / 2) * scale;

  svg.call(
    zoomBehavior.transform,
    d3.zoomIdentity.translate(tx, ty).scale(scale)
  );
}
