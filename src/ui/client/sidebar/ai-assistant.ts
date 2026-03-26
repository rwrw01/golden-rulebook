/**
 * AI Assistant sidebar — compact chat + suggestions
 */
import { h } from 'preact';
import { html } from 'htm/preact';

import { activePanelTab, panelVisible, activeTab } from '../shared/state.js';

const SUGGESTIONS = [
  'Wat is de impact als {app} uitvalt?',
  'Welke processen raakt een storing in {app}?',
  'Wie moeten we informeren bij een {app} storing?',
  'Hoeveel applicaties hebben geen gedocumenteerd bedrijfsproces?',
  'Welke applicaties draaien op dezelfde infrastructuur als {app}?',
];

export function AiSidebar() {
  const currentApp = activeTab.value?.title ?? '{applicatie}';

  function openChat(suggestion: string): void {
    panelVisible.value = true;
    activePanelTab.value = 'chat';
  }

  return html`
    <div class="ai-sidebar">
      <div class="section-label">AI Assistent</div>
      <p class="sidebar-hint">
        De AI chat is beschikbaar in het onderste panel. Gebruik Ctrl+J om het panel te tonen/verbergen.
      </p>

      <button class="sidebar-action-btn" onClick=${() => { panelVisible.value = true; activePanelTab.value = 'chat'; }}>
        Open AI Chat
      </button>

      <div class="section-label" style="margin-top: 16px">Suggesties</div>
      ${SUGGESTIONS.map(s => {
        const text = s.replace('{app}', currentApp);
        return html`
          <div class="suggestion-item" onClick=${() => openChat(text)}>
            ${text}
          </div>
        `;
      })}

      <div class="section-label" style="margin-top: 16px">Context</div>
      <p class="sidebar-hint">
        ${activeTab.value
          ? `Actief object: ${activeTab.value.title} (${activeTab.value.typeName})`
          : 'Geen object geselecteerd. Open een object om context-aware suggesties te krijgen.'}
      </p>
    </div>
  `;
}
