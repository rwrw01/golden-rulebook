/**
 * Relations sidebar — filter and explore relationship types
 */
import { h } from 'preact';
import { html } from 'htm/preact';

import { relationTypeFilter, relationDepth, openTab } from '../shared/state.js';
import { TYPE_COLORS } from '../shared/types.js';

const RELATION_TYPES = [
  'usedby', 'assignment', 'flow', 'realization', 'access',
  'aggregation', 'composition', 'association', 'specialization',
];

const OBJECT_TYPES = [
  'Applicatie', 'Bedrijfsproces', 'Bedrijfsfunctie', 'Actor',
  'Locatie', 'Node', 'Database', 'Package',
];

export function RelationsSidebar() {
  function toggleRelationType(type: string): void {
    const current = relationTypeFilter.value;
    if (current.includes(type)) {
      relationTypeFilter.value = current.filter(t => t !== type);
    } else {
      relationTypeFilter.value = [...current, type];
    }
  }

  return html`
    <div class="relations-sidebar">
      <button class="sidebar-action-btn" onClick=${() => openTab('__infra-topology__', 'Netwerktopologie', '__infra__')}>
        Netwerktopologie openen
      </button>

      <div class="filter-section">
        <div class="section-label">Relatietype</div>
        <div class="filter-chips">
          ${RELATION_TYPES.map(type => html`
            <label class="filter-chip ${relationTypeFilter.value.includes(type) ? 'active' : ''}">
              <input
                type="checkbox"
                checked=${relationTypeFilter.value.includes(type)}
                onChange=${() => toggleRelationType(type)}
              />
              ${type}
            </label>
          `)}
        </div>
      </div>

      <div class="filter-section">
        <div class="section-label">Diepte: ${relationDepth.value} niveau${relationDepth.value > 1 ? 's' : ''}</div>
        <input
          type="range"
          min="1"
          max="3"
          value=${relationDepth.value}
          onInput=${(e: Event) => { relationDepth.value = parseInt((e.target as HTMLInputElement).value, 10); }}
          class="depth-slider"
        />
      </div>

      <div class="filter-section">
        <div class="section-label">Objecttypen</div>
        <div class="object-type-list">
          ${OBJECT_TYPES.map(type => html`
            <div class="object-type-item">
              <span class="tree-dot" style="background: ${TYPE_COLORS[type] ?? '#666'}" />
              <span>${type}</span>
            </div>
          `)}
        </div>
      </div>

      <div class="filter-section">
        <div class="section-label">Instructie</div>
        <p class="sidebar-hint">Open een object in de editor en schakel naar het Diagram-tabblad om de gefilterde relaties te bekijken.</p>
      </div>
    </div>
  `;
}
