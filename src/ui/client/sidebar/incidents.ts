/**
 * Incidents sidebar — TopDesk integration (placeholder + manual entry)
 */
import { h } from 'preact';
import { html } from 'htm/preact';
import { useState } from 'preact/hooks';

import { openTab, activePanelTab } from '../shared/state.js';

interface ManualIncident {
  id: number;
  subject: string;
  description: string;
  status: string;
  createdAt: string;
}

let nextId = 1;

export function IncidentsSidebar() {
  const [incidents, setIncidents] = useState<ManualIncident[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');

  function addIncident(): void {
    if (!subject.trim()) return;
    const incident: ManualIncident = {
      id: nextId++,
      subject: subject.trim(),
      description: description.trim(),
      status: 'open',
      createdAt: new Date().toLocaleString('nl-NL'),
    };
    setIncidents(prev => [incident, ...prev]);
    setSubject('');
    setDescription('');
    setShowForm(false);
    activePanelTab.value = 'chat';
  }

  return html`
    <div class="incidents-sidebar">
      <button class="sidebar-action-btn" onClick=${() => setShowForm(!showForm)}>
        ${showForm ? '✕ Annuleren' : '+ Nieuwe storing'}
      </button>

      ${showForm && html`
        <div class="incident-form">
          <input
            class="sidebar-search"
            type="text"
            placeholder="Onderwerp..."
            value=${subject}
            onInput=${(e: Event) => setSubject((e.target as HTMLInputElement).value)}
          />
          <textarea
            class="sidebar-textarea"
            placeholder="Beschrijving..."
            value=${description}
            onInput=${(e: Event) => setDescription((e.target as HTMLTextAreaElement).value)}
          />
          <button class="sidebar-submit-btn" onClick=${addIncident}>Melden</button>
        </div>
      `}

      ${incidents.length > 0 && html`
        <div class="section-label" style="margin-top: 12px">Gemelde incidenten</div>
        ${incidents.map(inc => html`
          <div class="incident-item">
            <div class="incident-subject">${inc.subject}</div>
            <div class="incident-meta">${inc.createdAt} · ${inc.status}</div>
          </div>
        `)}
      `}

      ${incidents.length === 0 && !showForm && html`
        <div class="sidebar-empty">
          <p>Geen actieve incidenten.</p>
          <p class="sidebar-hint">Meld een storing hierboven of importeer een TopDesk CSV-export.</p>
        </div>
      `}

      <div class="section-label" style="margin-top: 16px">TopDesk-koppeling</div>
      <p class="sidebar-hint">CSV/Excel import wordt binnenkort ondersteund. Sleep een bestand hierheen of gebruik het importcommando.</p>
    </div>
  `;
}
