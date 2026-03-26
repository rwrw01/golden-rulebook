/**
 * Portfolio sidebar — tree view of all objects grouped by ArchiMate type
 */
import { h } from 'preact';
import { html } from 'htm/preact';
import { useState, useEffect } from 'preact/hooks';
import { signal } from '@preact/signals';

import { portfolioFilter, openTab } from '../shared/state.js';
import { getObjects } from '../shared/api-client.js';
import { BdObject, TYPE_COLORS } from '../shared/types.js';

interface TypeGroup {
  typeName: string;
  items: BdObject[];
  expanded: boolean;
}

export function PortfolioSidebar() {
  const [groups, setGroups] = useState<TypeGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadObjects();
  }, []);

  async function loadObjects(): Promise<void> {
    setLoading(true);
    const objects = await getObjects();
    const grouped = new Map<string, BdObject[]>();
    for (const obj of objects) {
      const list = grouped.get(obj.type_name) ?? [];
      list.push(obj);
      grouped.set(obj.type_name, list);
    }

    const result: TypeGroup[] = [...grouped.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .map(([typeName, items]) => ({ typeName, items, expanded: false }));

    setGroups(result);
    setLoading(false);
  }

  function toggleGroup(typeName: string): void {
    setGroups(prev => prev.map(g =>
      g.typeName === typeName ? { ...g, expanded: !g.expanded } : g
    ));
  }

  const filter = portfolioFilter.value.toLowerCase();

  return html`
    <div class="portfolio-sidebar">
      <input
        class="sidebar-search"
        type="text"
        placeholder="Filter objecten..."
        value=${portfolioFilter.value}
        onInput=${(e: Event) => { portfolioFilter.value = (e.target as HTMLInputElement).value; }}
      />
      ${loading ? html`<div class="sidebar-loading">Laden...</div>` : html`
        <div class="tree-view">
          ${groups.map(group => {
            const filtered = filter
              ? group.items.filter(i => i.title.toLowerCase().includes(filter))
              : group.items;
            if (filter && filtered.length === 0) return null;

            return html`
              <div class="tree-group">
                <div class="tree-group-header" onClick=${() => toggleGroup(group.typeName)}>
                  <span class="tree-arrow">${group.expanded || filter ? '▼' : '▶'}</span>
                  <span class="tree-dot" style="background: ${TYPE_COLORS[group.typeName] ?? '#666'}" />
                  <span class="tree-label">${group.typeName}</span>
                  <span class="tree-count">${filtered.length}</span>
                </div>
                ${(group.expanded || filter) && html`
                  <div class="tree-items">
                    ${filtered.slice(0, 100).map(item => html`
                      <div
                        class="tree-item"
                        onClick=${() => openTab(item.id, item.title, item.type_name)}
                      >
                        ${item.title}
                      </div>
                    `)}
                    ${filtered.length > 100 && html`
                      <div class="tree-item tree-more">...en ${filtered.length - 100} meer</div>
                    `}
                  </div>
                `}
              </div>
            `;
          })}
        </div>
      `}
    </div>
  `;
}
