/**
 * Generic object view — for non-application objects (processes, actors, etc.)
 */
import { h } from 'preact';
import { html } from 'htm/preact';
import { useState, useEffect } from 'preact/hooks';

import { getObject } from '../../shared/api-client.js';
import { BdRelation, TYPE_COLORS } from '../../shared/types.js';
import { navigateToObject, openTab } from '../../shared/state.js';
import { GraphView } from './graph-view.js';

const INFRA_TYPES = new Set(['Netwerk Device', 'Netwerk', 'Node', 'Database', 'Apparaat']);

type SubTab = 'overview' | 'graph';

export function GenericView({ objectId, title, typeName }: { objectId: string; title: string; typeName: string }) {
  const [relations, setRelations] = useState<BdRelation[]>([]);
  const [loading, setLoading] = useState(true);
  const [subTab, setSubTab] = useState<SubTab>('overview');

  useEffect(() => {
    setLoading(true);
    getObject(objectId).then(data => {
      setRelations(data?.relations ?? []);
      setLoading(false);
    });
  }, [objectId]);

  if (loading) {
    return html`<div class="view-loading">Laden...</div>`;
  }

  // Group relations by type
  const grouped = new Map<string, BdRelation[]>();
  for (const r of relations) {
    const list = grouped.get(r.type) ?? [];
    list.push(r);
    grouped.set(r.type, list);
  }

  const isInfra = INFRA_TYPES.has(typeName);

  return html`
    <div class="object-view">
      <div class="view-subtabs">
        <button class="subtab ${subTab === 'overview' ? 'active' : ''}" onClick=${() => setSubTab('overview')}>Overview</button>
        <button class="subtab ${subTab === 'graph' ? 'active' : ''}" onClick=${() => setSubTab('graph')}>Graph</button>
      </div>

      ${subTab === 'overview' && html`
        <div class="generic-header">
          <span class="tree-dot large" style="background: ${TYPE_COLORS[typeName] ?? '#666'}" />
          <div>
            <h2 class="generic-title">${title}</h2>
            <p class="generic-type">${typeName}</p>
          </div>
        </div>

        ${isInfra && html`
          <button class="sidebar-action-btn" style="margin-bottom:16px;width:auto;display:inline-block"
            onClick=${() => openTab('__infra-topology__', 'Netwerktopologie', '__infra__')}>
            Toon in netwerktopologie
          </button>
        `}

        <div class="generic-relations">
          <h3>Relaties (${relations.length})</h3>
          ${[...grouped.entries()].map(([type, items]) => html`
            <div class="relation-group">
              <div class="relation-group-header">
                <span class="tree-dot" style="background: ${TYPE_COLORS[type] ?? '#666'}" />
                ${type} (${items.length})
              </div>
              <div class="relation-group-items">
                ${items.map(r => html`
                  <a class="relation-link" onClick=${() => navigateToObject(r.id, r.title, r.type, r.relationship_type)}>
                    ${r.title}
                    <span class="relation-label">${r.relationship_name}</span>
                  </a>
                `)}
              </div>
            </div>
          `)}

          ${relations.length === 0 && html`
            <p class="sidebar-hint">Geen relaties gevonden voor dit object.</p>
          `}
        </div>
      `}

      ${subTab === 'graph' && html`
        <${GraphView} objectId=${objectId} title=${title} />
      `}
    </div>
  `;
}
