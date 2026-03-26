/**
 * Infrastructure Topology View — Cytoscape.js with compound nodes
 * Network segments, devices as nested containers, static layout
 */
import { h } from 'preact';
import { html } from 'htm/preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import cytoscape from 'cytoscape';
// @ts-expect-error no types for cytoscape-dagre
import dagre from 'cytoscape-dagre';

import { getInfraTopology, InfraTopology } from '../../shared/api-client.js';
import { navigateToObject } from '../../shared/state.js';

cytoscape.use(dagre);

export function InfraTopologyView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [stats, setStats] = useState({ devices: 0, networks: 0 });

  useEffect(() => {
    if (!containerRef.current) return;
    setLoading(true);

    getInfraTopology().then(data => {
      if (!containerRef.current) return;
      if (cyRef.current) { cyRef.current.destroy(); cyRef.current = null; }

      const { elements, deviceCount, networkCount } = buildElements(data, filter);
      setStats({ devices: deviceCount, networks: networkCount });

      if (elements.length === 0) {
        setLoading(false);
        return;
      }

      const cy = cytoscape({
        container: containerRef.current,
        elements,
        style: [
          // Network nodes
          {
            selector: 'node[nodeType="network"]',
            style: {
              'label': 'data(label)',
              'background-color': '#8dd3c7',
              'shape': 'round-rectangle',
              'width': 'label' as unknown as number,
              'height': 'label' as unknown as number,
              'padding': '8px',
              'font-size': '12px',
              'font-family': '-apple-system, Segoe UI, system-ui, sans-serif',
              'color': '#1a1d27',
              'text-valign': 'center',
              'text-halign': 'center',
              'border-width': 1,
              'border-color': '#5aad9e',
            } as cytoscape.Css.Node,
          },
          // Device cluster (parent) — compound container
          {
            selector: 'node[nodeType="cluster"]',
            style: {
              'label': 'data(label)',
              'background-color': '#1e2430',
              'background-opacity': 0.8,
              'shape': 'round-rectangle',
              'border-width': 2,
              'border-color': '#4f8ff7',
              'font-size': '13px',
              'font-weight': 'bold',
              'color': '#e1e4ed',
              'text-valign': 'top',
              'text-halign': 'center',
              'text-margin-y': 10,
              'padding': '20px',
              'font-family': '-apple-system, Segoe UI, system-ui, sans-serif',
            } as cytoscape.Css.Node,
          },
          // Child device inside a cluster
          {
            selector: 'node[nodeType="child-device"]',
            style: {
              'label': 'data(label)',
              'background-color': '#2a4a3f',
              'shape': 'round-rectangle',
              'width': 'label' as unknown as number,
              'height': 'label' as unknown as number,
              'padding': '8px',
              'font-size': '11px',
              'color': '#8dd3c7',
              'text-valign': 'center',
              'text-halign': 'center',
              'border-width': 1,
              'border-color': '#3a6a5a',
              'font-family': '-apple-system, Segoe UI, system-ui, sans-serif',
            } as cytoscape.Css.Node,
          },
          // Standalone device (no children)
          {
            selector: 'node[nodeType="device"]',
            style: {
              'label': 'data(label)',
              'background-color': '#2a3a4a',
              'shape': 'round-rectangle',
              'width': 'label' as unknown as number,
              'height': 'label' as unknown as number,
              'padding': '10px',
              'font-size': '12px',
              'color': '#80b1d3',
              'text-valign': 'center',
              'text-halign': 'center',
              'border-width': 1,
              'border-color': '#4a6a8a',
              'font-family': '-apple-system, Segoe UI, system-ui, sans-serif',
            } as cytoscape.Css.Node,
          },
          // Location nodes
          {
            selector: 'node[nodeType="location"]',
            style: {
              'label': 'data(label)',
              'background-color': '#fb8072',
              'shape': 'round-rectangle',
              'width': 'label' as unknown as number,
              'height': 'label' as unknown as number,
              'padding': '8px',
              'font-size': '12px',
              'color': '#1a1d27',
              'text-valign': 'center',
              'text-halign': 'center',
              'border-width': 1,
              'border-color': '#d06050',
              'font-family': '-apple-system, Segoe UI, system-ui, sans-serif',
            } as cytoscape.Css.Node,
          },
          // Edges — unbundled bezier for smooth curves
          {
            selector: 'edge',
            style: {
              'line-color': '#3a4a5a',
              'target-arrow-color': '#3a4a5a',
              'width': 1.5,
              'curve-style': 'unbundled-bezier',
              'control-point-distances': [40],
              'control-point-weights': [0.5],
              'opacity': 0.5,
              'target-arrow-shape': 'none',
            } as cytoscape.Css.Edge,
          },
          // Composition edges
          {
            selector: 'edge[relType="composition"]',
            style: {
              'line-color': '#4f8ff7',
              'width': 2,
              'opacity': 0.3,
              'curve-style': 'unbundled-bezier',
              'control-point-distances': [20],
              'control-point-weights': [0.5],
            } as cytoscape.Css.Edge,
          },
          // Hover / selection
          {
            selector: 'node:selected',
            style: {
              'border-width': 3,
              'border-color': '#4f8ff7',
            } as cytoscape.Css.Node,
          },
          {
            selector: 'node.highlighted',
            style: {
              'border-width': 2,
              'border-color': '#4f8ff7',
              'opacity': 1,
            } as cytoscape.Css.Node,
          },
          {
            selector: 'node.dimmed',
            style: { 'opacity': 0.2 } as cytoscape.Css.Node,
          },
          {
            selector: 'edge.dimmed',
            style: { 'opacity': 0.05 } as cytoscape.Css.Edge,
          },
          {
            selector: 'edge.highlighted',
            style: {
              'line-color': '#4f8ff7',
              'opacity': 0.8,
              'width': 2,
            } as cytoscape.Css.Edge,
          },
        ],
        layout: {
          name: 'cose',
          animate: false,
          nodeRepulsion: () => 12000,
          idealEdgeLength: () => 120,
          nodeOverlap: 40,
          gravity: 0.25,
          nestingFactor: 1.2,
          padding: 40,
          randomize: false,
          numIter: 1000,
          fit: true,
        } as cytoscape.LayoutOptions,
        minZoom: 0.2,
        maxZoom: 3,
        wheelSensitivity: 0.3,
      });

      // Click → navigate
      cy.on('tap', 'node', (evt) => {
        const node = evt.target;
        if (node.data('objectId')) {
          navigateToObject(node.data('objectId'), node.data('fullTitle'), node.data('objectType'));
        }
      });

      // Hover → highlight connected
      cy.on('mouseover', 'node', (evt) => {
        const node = evt.target;
        const neighborhood = node.neighborhood().add(node);
        cy.elements().addClass('dimmed');
        neighborhood.removeClass('dimmed').addClass('highlighted');
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
  }, [filter]);

  return html`
    <div class="graph-view-container">
      <div class="graph-controls">
        <h3 style="font-size:14px;font-weight:500;margin:0">Netwerktopologie</h3>
        <input
          class="sidebar-search"
          type="text"
          placeholder="Filter op device of netwerk..."
          value=${filter}
          onInput=${(e: Event) => setFilter((e.target as HTMLInputElement).value)}
          style="max-width:260px;margin:0"
        />
        <span class="graph-info">${stats.devices} devices · ${stats.networks} netwerken</span>
      </div>

      ${loading && html`<div class="view-loading">Topologie laden...</div>`}
      <div ref=${containerRef} class="cy-graph" />

      <div class="graph-footer">
        <div class="graph-legend">
          <span class="legend-item"><span class="legend-dot" style="background:#8dd3c7" />Netwerk</span>
          <span class="legend-item"><span class="legend-dot" style="background:#4f8ff7" />Device cluster</span>
          <span class="legend-item"><span class="legend-dot" style="background:#2a3a4a;border:1px solid #4a6a8a" />Device</span>
          <span class="legend-item"><span class="legend-dot" style="background:#fb8072" />Locatie</span>
        </div>
      </div>
    </div>
  `;
}

function buildElements(data: InfraTopology, filter: string): {
  elements: cytoscape.ElementDefinition[];
  deviceCount: number;
  networkCount: number;
} {
  const elements: cytoscape.ElementDefinition[] = [];
  const filterLower = filter.toLowerCase();

  // Filter devices
  let devices = data.devices.filter(d => d.networks.length > 0 || d.children.length > 0);
  if (filter.length >= 2) {
    devices = data.devices.filter(d =>
      d.title.toLowerCase().includes(filterLower) ||
      d.children.some(c => c.title.toLowerCase().includes(filterLower)) ||
      (d.location?.title.toLowerCase().includes(filterLower) ?? false)
    );
  }

  // Limit to top 25 devices for readability
  devices = devices.slice(0, 25);

  // Collect referenced networks
  const usedNetworkIds = new Set<string>();
  for (const d of devices) {
    for (const nid of d.networks) usedNetworkIds.add(nid);
    for (const c of d.children) {
      for (const nid of c.networks) usedNetworkIds.add(nid);
    }
  }

  const networkMap = new Map(data.networks.map(n => [n.id, n]));

  // Add network nodes
  const addedNetworks = new Set<string>();
  for (const nid of usedNetworkIds) {
    const net = networkMap.get(nid);
    if (!net) continue;
    addedNetworks.add(nid);
    elements.push({
      data: {
        id: `net-${nid}`,
        label: net.title,
        fullTitle: net.title,
        objectId: nid,
        objectType: 'Netwerk',
        nodeType: 'network',
      },
    });
  }

  // Add device nodes + edges
  const addedLocations = new Set<string>();

  for (const device of devices) {
    const isCluster = device.children.length > 0;
    const deviceNodeId = `dev-${device.id}`;

    if (isCluster) {
      // Parent cluster as compound node
      elements.push({
        data: {
          id: deviceNodeId,
          label: device.title,
          fullTitle: device.title,
          objectId: device.id,
          objectType: 'Netwerk Device',
          nodeType: 'cluster',
        },
      });

      // Children inside cluster
      for (const child of device.children) {
        const childNodeId = `dev-${child.id}`;
        elements.push({
          data: {
            id: childNodeId,
            parent: deviceNodeId,
            label: child.title,
            fullTitle: child.title,
            objectId: child.id,
            objectType: 'Netwerk Device',
            nodeType: 'child-device',
          },
        });

        // Child → network edges
        for (const nid of child.networks) {
          if (!addedNetworks.has(nid)) continue;
          elements.push({
            data: { id: `e-${childNodeId}-net-${nid}`, source: childNodeId, target: `net-${nid}`, relType: 'association' },
          });
        }
      }

      // Cluster → network edges (only for nets not already covered by children)
      const childNets = new Set(device.children.flatMap(c => c.networks));
      for (const nid of device.networks) {
        if (!addedNetworks.has(nid) || childNets.has(nid)) continue;
        elements.push({
          data: { id: `e-${deviceNodeId}-net-${nid}`, source: deviceNodeId, target: `net-${nid}`, relType: 'association' },
        });
      }
    } else {
      // Standalone device
      elements.push({
        data: {
          id: deviceNodeId,
          label: device.title,
          fullTitle: device.title,
          objectId: device.id,
          objectType: 'Netwerk Device',
          nodeType: 'device',
        },
      });

      // Device → network edges
      for (const nid of device.networks) {
        if (!addedNetworks.has(nid)) continue;
        elements.push({
          data: { id: `e-${deviceNodeId}-net-${nid}`, source: deviceNodeId, target: `net-${nid}`, relType: 'association' },
        });
      }
    }

    // Location node + edge
    if (device.location && !addedLocations.has(device.location.id)) {
      addedLocations.add(device.location.id);
      elements.push({
        data: {
          id: `loc-${device.location.id}`,
          label: device.location.title,
          fullTitle: device.location.title,
          objectId: device.location.id,
          objectType: 'Locatie',
          nodeType: 'location',
        },
      });
    }
    if (device.location) {
      elements.push({
        data: { id: `e-${deviceNodeId}-loc-${device.location.id}`, source: deviceNodeId, target: `loc-${device.location.id}`, relType: 'assignment' },
      });
    }
  }

  return {
    elements,
    deviceCount: devices.length,
    networkCount: addedNetworks.size,
  };
}
