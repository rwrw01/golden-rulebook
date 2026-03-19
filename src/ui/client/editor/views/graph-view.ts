/**
 * Cytoscape.js graph view with multiple layouts and filtered view presets
 * Replaces D3.js — all layouts are static (no jitter/physics wobble)
 * ArchiMate color scheme from docs/infra-graph-reconstruction.md
 */
import { h } from 'preact';
import { html } from 'htm/preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import cytoscape from 'cytoscape';
// @ts-expect-error no types for cytoscape-dagre
import dagre from 'cytoscape-dagre';

import { getGraph } from '../../shared/api-client.js';
import { navigateToObject } from '../../shared/state.js';
import { TidyTreeView } from './tidy-tree-view.js';
import { ChainView } from './chain-view.js';

cytoscape.use(dagre);

// ArchiMate standard color scheme
const COLORS: Record<string, string> = {
  'Applicatie':            '#80b1d3',
  'Applicatie-interface':  '#80b1d3',
  'Applicatieservice':     '#80b1d3',
  'Bedrijfsproces':        '#ffffb3',
  'Bedrijfsfunctie':       '#ffffb3',
  'Actor':                 '#ffffb3',
  'Bedrijfsservice':       '#ffffb3',
  'Bedrijfsobject':        '#ffffb3',
  'Node':                  '#8dd3c7',
  'Netwerk':               '#8dd3c7',
  'Netwerk Device':        '#8dd3c7',
  'Apparaat':              '#8dd3c7',
  'Database':              '#8dd3c7',
  'Technologie-interface': '#8dd3c7',
  'Technologieservice':    '#8dd3c7',
  'Locatie':               '#fb8072',
  'Package':               '#b3de69',
  'Gegevensobject':        '#fdb462',
  'Referentiecomponent':   '#bebada',
};

const TEXT_COLOR: Record<string, string> = {
  'Applicatie': '#1a1d27', 'Bedrijfsproces': '#1a1d27', 'Actor': '#1a1d27',
  'Node': '#1a1d27', 'Netwerk': '#1a1d27', 'Database': '#1a1d27',
  'Locatie': '#1a1d27', 'Gegevensobject': '#1a1d27',
};

const EDGE_STYLES: Record<string, { lineStyle: string; width: number }> = {
  'composition':    { lineStyle: 'solid',  width: 2 },
  'aggregation':    { lineStyle: 'solid',  width: 1.5 },
  'association':    { lineStyle: 'solid',  width: 1.2 },
  'flow':           { lineStyle: 'solid',  width: 1.2 },
  'usedby':         { lineStyle: 'solid',  width: 1.2 },
  'assignment':     { lineStyle: 'dashed', width: 1 },
  'realization':    { lineStyle: 'dashed', width: 1 },
  'access':         { lineStyle: 'dashed', width: 1 },
  'specialization': { lineStyle: 'solid',  width: 1 },
};

// ===== VIEW PRESETS =====
interface GraphViewPreset {
  id: string;
  label: string;
  allowedTypes: Set<string>;
  allowedRelations: Set<string>;
  depth: number;
  maxNodes: number;
}

const ALL_TYPES = new Set(Object.keys(COLORS));
const ALL_RELATIONS = new Set(Object.keys(EDGE_STYLES));

const GRAPH_PRESETS: GraphViewPreset[] = [
  {
    id: 'overview', label: 'Overzicht',
    allowedTypes: new Set(['Applicatie', 'Bedrijfsproces', 'Actor', 'Locatie']),
    allowedRelations: new Set(['usedby', 'assignment']),
    depth: 1, maxNodes: 25,
  },
  {
    id: 'infra', label: 'Infrastructuur',
    allowedTypes: new Set(['Applicatie', 'Node', 'Database', 'Netwerk', 'Netwerk Device', 'Apparaat', 'Locatie', 'Package']),
    allowedRelations: new Set(['realization', 'access', 'composition', 'association']),
    depth: 2, maxNodes: 30,
  },
  {
    id: 'processes', label: 'Processen',
    allowedTypes: new Set(['Applicatie', 'Bedrijfsproces', 'Bedrijfsfunctie', 'Actor', 'Bedrijfsobject']),
    allowedRelations: new Set(['usedby', 'aggregation', 'assignment']),
    depth: 1, maxNodes: 25,
  },
  {
    id: 'dataflows', label: 'Datastromen',
    allowedTypes: new Set(['Applicatie', 'Database', 'Gegevensobject', 'Applicatie-interface', 'Applicatieservice']),
    allowedRelations: new Set(['flow', 'access']),
    depth: 1, maxNodes: 25,
  },
  {
    id: 'all', label: 'Alles',
    allowedTypes: ALL_TYPES, allowedRelations: ALL_RELATIONS,
    depth: 1, maxNodes: 50,
  },
];

const ALWAYS_HIDDEN = new Set(['Technologie-interface']);

// ===== LAYOUT TYPES =====
type LayoutType = 'tidytree' | 'dagre' | 'concentric' | 'cose' | 'chain';

const LAYOUT_OPTIONS: Array<{ id: LayoutType; label: string }> = [
  { id: 'tidytree', label: 'Tidy Tree (D3)' },
  { id: 'dagre', label: 'Hiërarchisch' },
  { id: 'concentric', label: 'Radiaal' },
  { id: 'cose', label: 'Organisch' },
  { id: 'chain', label: 'Ketenanalyse' },
];

// ===== MAIN COMPONENT =====
export function GraphView({ objectId, title }: { objectId: string; title: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const [loading, setLoading] = useState(true);
  const [nodeCount, setNodeCount] = useState(0);
  const [activePreset, setActivePreset] = useState('overview');
  const [layoutType, setLayoutType] = useState<LayoutType>('chain');
  const isTidyTree = layoutType === 'tidytree';
  const isChain = layoutType === 'chain';
  const skipCytoscape = isTidyTree || isChain;

  const preset = GRAPH_PRESETS.find(p => p.id === activePreset) ?? GRAPH_PRESETS[0];

  useEffect(() => {
    if (skipCytoscape) return;
    if (!containerRef.current) return;
    setLoading(true);

    getGraph(objectId, preset.depth).then(data => {
      if (!containerRef.current) return;

      // Filter nodes
      let nodes = data.nodes.filter(n =>
        !ALWAYS_HIDDEN.has(n.type) && preset.allowedTypes.has(n.type)
      );
      const rootNode = data.nodes.find(n => n.id === objectId);
      if (rootNode && !nodes.find(n => n.id === objectId)) {
        nodes.unshift(rootNode);
      }

      // Filter edges
      const nodeIds = new Set(nodes.map(n => n.id));
      const edgeSet = new Set<string>();
      let edges = data.edges.filter(e => {
        if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) return false;
        if (!preset.allowedRelations.has(e.type)) return false;
        const key = [e.source, e.target].sort().join('-') + '-' + e.type;
        if (edgeSet.has(key)) return false;
        edgeSet.add(key);
        return true;
      });

      // Cap nodes
      if (nodes.length > preset.maxNodes) {
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
        nodes = nodes.slice(0, preset.maxNodes);
        const kept = new Set(nodes.map(n => n.id));
        edges = edges.filter(e => kept.has(e.source) && kept.has(e.target));
      }

      setNodeCount(nodes.length);

      // Destroy previous instance
      if (cyRef.current) { cyRef.current.destroy(); cyRef.current = null; }

      // Build Cytoscape elements
      const elements: cytoscape.ElementDefinition[] = [];

      for (const n of nodes) {
        elements.push({
          data: {
            id: n.id,
            label: n.title.length > 40 ? n.title.slice(0, 38) + '…' : n.title,
            fullTitle: n.title,
            type: n.type,
            isRoot: n.id === objectId,
          },
        });
      }

      for (const e of edges) {
        elements.push({
          data: {
            id: `e-${e.source}-${e.target}-${e.type}`,
            source: e.source,
            target: e.target,
            label: e.label,
            relType: e.type,
          },
        });
      }

      // Create Cytoscape instance
      const cy = cytoscape({
        container: containerRef.current,
        elements,
        style: [
          {
            selector: 'node',
            style: {
              'label': 'data(label)',
              'background-color': (ele: cytoscape.NodeSingular) => COLORS[ele.data('type')] ?? '#555',
              'color': (ele: cytoscape.NodeSingular) => TEXT_COLOR[ele.data('type')] ?? '#e1e4ed',
              'text-valign': 'center',
              'text-halign': 'center',
              'font-size': (ele: cytoscape.NodeSingular) => ele.data('isRoot') ? '13px' : '11px',
              'font-weight': (ele: cytoscape.NodeSingular) => ele.data('isRoot') ? 'bold' : 'normal',
              'font-family': '-apple-system, Segoe UI, system-ui, sans-serif',
              'width': 'label' as unknown as number,
              'height': 'label' as unknown as number,
              'padding': (ele: cytoscape.NodeSingular) => ele.data('isRoot') ? '12px' : '8px',
              'shape': 'round-rectangle',
              'border-width': (ele: cytoscape.NodeSingular) => ele.data('isRoot') ? 3 : 1,
              'border-color': (ele: cytoscape.NodeSingular) => ele.data('isRoot') ? '#4f8ff7' : '#2a2d3a',
            } as cytoscape.Css.Node,
          },
          {
            selector: 'edge',
            style: {
              'width': (ele: cytoscape.EdgeSingular) => EDGE_STYLES[ele.data('relType')]?.width ?? 1,
              'line-style': (ele: cytoscape.EdgeSingular) => (EDGE_STYLES[ele.data('relType')]?.lineStyle ?? 'solid') as 'solid' | 'dashed',
              'line-color': '#3a3d4a',
              'target-arrow-color': '#3a3d4a',
              'target-arrow-shape': (ele: cytoscape.EdgeSingular) =>
                ['flow', 'usedby', 'access'].includes(ele.data('relType')) ? 'triangle' : 'none',
              'curve-style': 'unbundled-bezier',
              'control-point-distances': [40],
              'control-point-weights': [0.5],
              'opacity': 0.5,
            } as cytoscape.Css.Edge,
          },
          {
            selector: 'node:selected',
            style: {
              'border-width': 3,
              'border-color': '#4f8ff7',
            } as cytoscape.Css.Node,
          },
          {
            selector: 'edge:selected',
            style: {
              'line-color': '#4f8ff7',
              'target-arrow-color': '#4f8ff7',
              'opacity': 1,
              'label': 'data(label)',
              'font-size': '9px',
              'color': '#8b8fa3',
              'text-rotation': 'autorotate',
              'text-background-color': '#0f1117',
              'text-background-opacity': 0.8,
              'text-background-padding': '2px',
            } as cytoscape.Css.Edge,
          },
          {
            selector: 'node.highlighted',
            style: { 'border-width': 3, 'border-color': '#4f8ff7' } as cytoscape.Css.Node,
          },
          {
            selector: 'node.dimmed',
            style: { 'opacity': 0.15 } as cytoscape.Css.Node,
          },
          {
            selector: 'edge.dimmed',
            style: { 'opacity': 0.05 } as cytoscape.Css.Edge,
          },
          {
            selector: 'edge.highlighted',
            style: { 'line-color': '#4f8ff7', 'opacity': 0.9, 'width': 2 } as cytoscape.Css.Edge,
          },
        ],
        layout: getLayout(layoutType, objectId),
        minZoom: 0.3,
        maxZoom: 3,
        wheelSensitivity: 0.3,
      });

      // After layout: fit nicely, zoom to reasonable level
      cy.ready(() => {
        cy.fit(undefined, 30);
        // Don't zoom out too far — ensure nodes are readable
        if (cy.zoom() < 0.6) {
          // Center on root node at readable zoom
          const rootNode = cy.getElementById(objectId);
          if (rootNode.length > 0) {
            cy.zoom({ level: 0.8, position: rootNode.position() });
            cy.center(rootNode);
          } else {
            cy.zoom(0.8);
            cy.center();
          }
        }
      });

      // Click handler: navigate to object
      cy.on('tap', 'node', (evt) => {
        const node = evt.target;
        navigateToObject(node.data('id'), node.data('fullTitle'), node.data('type'));
      });

      // Hover: highlight neighborhood
      cy.on('mouseover', 'node', (evt) => {
        const node = evt.target;
        const hood = node.neighborhood().add(node);
        cy.elements().not(hood).addClass('dimmed');
        hood.addClass('highlighted');
      });
      cy.on('mouseout', 'node', () => {
        cy.elements().removeClass('dimmed').removeClass('highlighted');
      });

      cyRef.current = cy;
      setLoading(false);
    });

    return () => {
      if (cyRef.current) { cyRef.current.destroy(); cyRef.current = null; }
    };
  }, [objectId, activePreset, layoutType]);

  // Build legend
  const visibleTypes = new Set<string>();
  for (const type of preset.allowedTypes) {
    if (!ALWAYS_HIDDEN.has(type) && COLORS[type]) visibleTypes.add(type);
  }

  return html`
    <div class="graph-view-container">
      <div class="graph-controls">
        ${!isChain && html`
          <div class="graph-view-selector">
            ${GRAPH_PRESETS.map(p => html`
              <button class="graph-preset-btn ${activePreset === p.id ? 'active' : ''}"
                onClick=${() => setActivePreset(p.id)}>${p.label}</button>
            `)}
          </div>
        `}
        <select class="graph-layout-select" value=${layoutType}
          onChange=${(e: Event) => setLayoutType((e.target as HTMLSelectElement).value as LayoutType)}>
          ${LAYOUT_OPTIONS.map(o => html`<option value=${o.id}>${o.label}</option>`)}
        </select>
      </div>

      ${isChain ? html`
        <${ChainView} objectId=${objectId} title=${title} />
      ` : isTidyTree ? html`
        <${TidyTreeView}
          objectId=${objectId}
          title=${title}
          depth=${preset.depth}
          allowedTypes=${preset.allowedTypes}
          allowedRelations=${preset.allowedRelations}
          maxNodes=${preset.maxNodes}
        />
      ` : html`
        ${loading && html`<div class="view-loading">Laden...</div>`}
        <div ref=${containerRef} class="cy-graph" />
      `}

      <div class="graph-footer">
        <div class="graph-legend">
          ${[...visibleTypes].map(type => html`
            <span class="legend-item"><span class="legend-dot" style="background: ${COLORS[type]}" />${type}</span>
          `)}
        </div>
        ${nodeCount > 0 && html`<span class="graph-info">${nodeCount} objecten</span>`}
      </div>
    </div>
  `;
}

function getLayout(type: LayoutType, _rootId: string): cytoscape.LayoutOptions {
  switch (type) {
    case 'dagre':
      return {
        name: 'dagre',
        // @ts-expect-error dagre extension options not in base types
        rankDir: 'LR', nodeSep: 20, rankSep: 80, padding: 30, fit: true,
      };
    case 'concentric':
      return {
        name: 'concentric',
        concentric: (node: cytoscape.NodeSingular) => node.data('isRoot') ? 10 : node.degree(false),
        levelWidth: () => 2,
        padding: 20,
        minNodeSpacing: 40,
      } as cytoscape.LayoutOptions;
    case 'cose':
      return {
        name: 'cose',
        idealEdgeLength: () => 100,
        nodeOverlap: 20,
        padding: 20,
        nodeRepulsion: () => 4000,
        animate: false,
      } as cytoscape.LayoutOptions;
    default:
      return { name: 'cose', animate: false } as cytoscape.LayoutOptions;
  }
}
