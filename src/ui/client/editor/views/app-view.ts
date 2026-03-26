/**
 * Application detail view — impact chain, diagram, relations
 */
import { h } from 'preact';
import { html } from 'htm/preact';
import { useState, useEffect } from 'preact/hooks';

import { getImpact, getObject } from '../../shared/api-client.js';
import { ImpactResult, BdRelation, TYPE_COLORS } from '../../shared/types.js';
import { navigateToObject } from '../../shared/state.js';
import { GraphView } from './graph-view.js';

type SubTab = 'overview' | 'graph' | 'diagram' | 'relations';

export function AppView({ objectId, title }: { objectId: string; title: string }) {
  const [subTab, setSubTab] = useState<SubTab>('overview');
  const [impact, setImpact] = useState<ImpactResult | null>(null);
  const [relations, setRelations] = useState<BdRelation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getImpact(objectId),
      getObject(objectId),
    ]).then(([impactData, objData]) => {
      setImpact(impactData);
      setRelations(objData?.relations ?? []);
      setLoading(false);
    });
  }, [objectId]);

  if (loading) {
    return html`<div class="view-loading">Laden...</div>`;
  }

  return html`
    <div class="object-view">
      <div class="view-subtabs">
        <button class="subtab ${subTab === 'overview' ? 'active' : ''}" onClick=${() => setSubTab('overview')}>Overview</button>
        <button class="subtab ${subTab === 'graph' ? 'active' : ''}" onClick=${() => setSubTab('graph')}>Graph</button>
        <button class="subtab ${subTab === 'diagram' ? 'active' : ''}" onClick=${() => setSubTab('diagram')}>Diagram</button>
        <button class="subtab ${subTab === 'relations' ? 'active' : ''}" onClick=${() => setSubTab('relations')}>Relaties (${relations.length})</button>
      </div>

      ${subTab === 'overview' && impact && html`
        <div class="impact-chain-view">
          <div class="impact-level app">
            <h4>Applicatie (bron storing)</h4>
            <div class="impact-items">
              <span class="impact-tag">${impact.app.title}</span>
            </div>
          </div>
          <div class="impact-level location">
            <h4>Locaties (${impact.locations.length})</h4>
            <div class="impact-items">
              ${impact.locations.length === 0
                ? html`<span class="impact-tag empty">Geen</span>`
                : impact.locations.map(l => html`<span class="impact-tag">${l.title}</span>`)
              }
            </div>
          </div>
          <div class="impact-level process">
            <h4>Getroffen bedrijfsprocessen (${impact.processes.length})</h4>
            <div class="impact-items">
              ${impact.processes.length === 0
                ? html`<span class="impact-tag empty">Geen</span>`
                : impact.processes.map(p => html`
                    <a class="impact-tag clickable" onClick=${() => navigateToObject(p.id, p.title, 'Bedrijfsproces', 'usedby')}>${p.title}</a>
                  `)
              }
            </div>
          </div>
          <div class="impact-level function">
            <h4>Bedrijfsfuncties (${impact.functions.length})</h4>
            <div class="impact-items">
              ${impact.functions.length === 0
                ? html`<span class="impact-tag empty">Geen</span>`
                : impact.functions.map(f => html`
                    <a class="impact-tag clickable" onClick=${() => navigateToObject(f.id, f.title, 'Bedrijfsfunctie')}>${f.title}</a>
                  `)
              }
            </div>
          </div>
          <div class="impact-level actor">
            <h4>Te informeren actoren (${impact.actors.length})</h4>
            <div class="impact-items">
              ${impact.actors.length === 0
                ? html`<span class="impact-tag empty">Geen</span>`
                : impact.actors.map(a => html`
                    <a class="impact-tag clickable" onClick=${() => navigateToObject(a.id, a.title, 'Actor')}>${a.title}</a>
                  `)
              }
            </div>
          </div>

          ${impact.dependencies.length > 0 && html`
            <div class="impact-section">
              <h4>Afhankelijkheden (${impact.dependencies.length})</h4>
              <div class="impact-items">
                ${impact.dependencies.map(d => html`
                  <a class="impact-tag clickable" onClick=${() => navigateToObject(d.id, d.title, 'Applicatie', 'flow')}>
                    ${d.direction === 'incoming' ? '← ' : '→ '}${d.title}
                  </a>
                `)}
              </div>
            </div>
          `}

          ${impact.infrastructure.length > 0 && html`
            <div class="impact-section">
              <h4>Infrastructuur (${impact.infrastructure.length})</h4>
              <div class="impact-items">
                ${impact.infrastructure.map(i => html`
                  <span class="impact-tag">${i.type}: ${i.title}</span>
                `)}
              </div>
            </div>
          `}
        </div>
      `}

      ${subTab === 'graph' && html`
        <${GraphView} objectId=${objectId} title=${title} />
      `}

      ${subTab === 'diagram' && html`
        <div class="diagram-view">
          <img src="/api/diagram/${encodeURIComponent(objectId)}" alt="Diagram ${title}" class="diagram-img" />
        </div>
      `}

      ${subTab === 'relations' && html`
        <div class="relations-view">
          <table class="relations-table">
            <thead>
              <tr><th>Object</th><th>Type</th><th>Relatie</th></tr>
            </thead>
            <tbody>
              ${relations.map(r => html`
                <tr class="relation-row" onClick=${() => navigateToObject(r.id, r.title, r.type, r.relationship_type)}>
                  <td>
                    <span class="tree-dot" style="background: ${TYPE_COLORS[r.type] ?? '#666'}" />
                    ${r.title}
                  </td>
                  <td>${r.type}</td>
                  <td>${r.relationship_name}</td>
                </tr>
              `)}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;
}
