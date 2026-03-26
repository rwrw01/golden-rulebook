/**
 * Properties panel — metadata for the active object
 */
import { h } from 'preact';
import { html } from 'htm/preact';
import { useState, useEffect } from 'preact/hooks';

import { activeTab } from '../shared/state.js';
import { getObject } from '../shared/api-client.js';
import { TYPE_COLORS } from '../shared/types.js';

export function PropertiesPanel() {
  const tab = activeTab.value;
  const [relationCount, setRelationCount] = useState(0);

  useEffect(() => {
    if (tab) {
      getObject(tab.objectId).then(data => {
        setRelationCount(data?.relations.length ?? 0);
      });
    }
  }, [tab?.objectId]);

  if (!tab) {
    return html`<div class="panel-empty">Selecteer een object om eigenschappen te zien.</div>`;
  }

  return html`
    <div class="properties-panel">
      <table class="properties-table">
        <tbody>
          <tr><td class="prop-key">ID</td><td class="prop-value">${tab.objectId}</td></tr>
          <tr><td class="prop-key">Titel</td><td class="prop-value">${tab.title}</td></tr>
          <tr>
            <td class="prop-key">Type</td>
            <td class="prop-value">
              <span class="tree-dot" style="background: ${TYPE_COLORS[tab.typeName] ?? '#666'}" />
              ${tab.typeName}
            </td>
          </tr>
          <tr><td class="prop-key">Relaties</td><td class="prop-value">${relationCount}</td></tr>
        </tbody>
      </table>
    </div>
  `;
}
