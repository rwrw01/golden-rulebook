/**
 * Dashboard views — Portfolio overzicht, Locatieverdeling, Relatiedekking, Risico-indicatoren
 */
import { h } from 'preact';
import { html } from 'htm/preact';
import { useState, useEffect } from 'preact/hooks';

import { getDashboard } from '../../shared/api-client.js';
import { navigateToObject } from '../../shared/state.js';

interface TypeCount { name: string; count: number }
interface RelTypeCount { type: string; count: number }
interface LocationRow { id: string; location: string; objects: number }
interface OrphanRow { id: string; title: string; type: string }
interface AppRow { id: string; title: string }

export function DashboardView({ viewId }: { viewId: string }) {
  const [data, setData] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getDashboard(viewId).then(d => { setData(d); setLoading(false); });
  }, [viewId]);

  if (loading || !data) return html`<div class="dashboard-loading">Laden...</div>`;

  const d = data as Record<string, unknown>;
  if (viewId === 'overview') return html`<${OverviewDash} data=${d} />`;
  if (viewId === 'locations') return html`<${LocationsDash} data=${d} />`;
  if (viewId === 'coverage') return html`<${CoverageDash} data=${d} />`;
  if (viewId === 'risks') return html`<${RisksDash} data=${d} />`;

  return html`<div>Onbekend dashboard</div>`;
}

function OverviewDash({ data }: { data: { types: TypeCount[]; relTypes: RelTypeCount[] } }) {
  const maxCount = Math.max(...data.types.map(t => t.count));
  return html`
    <div class="dash-content">
      <h2 class="dash-title">Portfolio overzicht</h2>
      <div class="dash-section">
        <h3>Objecten per type</h3>
        <div class="dash-bars">
          ${data.types.map(t => html`
            <div class="dash-bar-row">
              <span class="dash-bar-label">${t.name}</span>
              <div class="dash-bar-track">
                <div class="dash-bar-fill" style="width: ${(t.count / maxCount) * 100}%" />
              </div>
              <span class="dash-bar-value">${t.count}</span>
            </div>
          `)}
        </div>
      </div>
      <div class="dash-section">
        <h3>Relaties per type</h3>
        <table class="dash-table">
          <thead><tr><th>Type</th><th>Aantal</th></tr></thead>
          <tbody>
            ${data.relTypes.map(r => html`
              <tr><td>${r.type}</td><td>${r.count}</td></tr>
            `)}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function LocationsDash({ data }: { data: { locations: LocationRow[] } }) {
  const maxObj = Math.max(...data.locations.map(l => l.objects), 1);
  return html`
    <div class="dash-content">
      <h2 class="dash-title">Locatieverdeling</h2>
      <p class="dash-subtitle">Cloud vs On-premise verdeling van objecten</p>
      <div class="dash-bars">
        ${data.locations.map(l => html`
          <div class="dash-bar-row clickable" onClick=${() => navigateToObject(l.id, l.location, 'Locatie')}>
            <span class="dash-bar-label">${l.location}</span>
            <div class="dash-bar-track">
              <div class="dash-bar-fill location" style="width: ${(l.objects / maxObj) * 100}%" />
            </div>
            <span class="dash-bar-value">${l.objects}</span>
          </div>
        `)}
      </div>
    </div>
  `;
}

function CoverageDash({ data }: { data: { orphans: OrphanRow[]; byType: Record<string, number>; total: number } }) {
  return html`
    <div class="dash-content">
      <h2 class="dash-title">Relatiedekking</h2>
      <p class="dash-subtitle">${data.total} objecten zonder enkele relatie</p>
      <div class="dash-section">
        <h3>Per type</h3>
        <div class="dash-tags">
          ${Object.entries(data.byType).sort((a, b) => b[1] - a[1]).map(([type, count]) => html`
            <span class="dash-tag">${type}: ${count}</span>
          `)}
        </div>
      </div>
      <div class="dash-section">
        <h3>Objecten</h3>
        <div class="dash-list">
          ${data.orphans.slice(0, 50).map(o => html`
            <div class="dash-list-item clickable" onClick=${() => navigateToObject(o.id, o.title, o.type)}>
              <span class="dash-list-type">${o.type}</span>
              <span class="dash-list-title">${o.title}</span>
            </div>
          `)}
          ${data.total > 50 ? html`<div class="dash-list-more">...en ${data.total - 50} meer</div>` : null}
        </div>
      </div>
    </div>
  `;
}

function RisksDash({ data }: { data: { noProcess: AppRow[]; noActor: AppRow[] } }) {
  return html`
    <div class="dash-content">
      <h2 class="dash-title">Risico-indicatoren</h2>
      <div class="dash-section">
        <h3>Applicaties zonder bedrijfsproces (${data.noProcess.length})</h3>
        <p class="dash-subtitle">Geen usedby relatie met een proces — impact bij storing onduidelijk</p>
        <div class="dash-list">
          ${data.noProcess.map(a => html`
            <div class="dash-list-item clickable" onClick=${() => navigateToObject(a.id, a.title, 'Applicatie')}>
              <span class="dash-list-title">${a.title}</span>
            </div>
          `)}
        </div>
      </div>
      <div class="dash-section">
        <h3>Applicaties zonder actor (${data.noActor.length})</h3>
        <p class="dash-subtitle">Geen actor gekoppeld — niemand te informeren bij storing</p>
        <div class="dash-list">
          ${data.noActor.map(a => html`
            <div class="dash-list-item clickable" onClick=${() => navigateToObject(a.id, a.title, 'Applicatie')}>
              <span class="dash-list-title">${a.title}</span>
            </div>
          `)}
        </div>
      </div>
    </div>
  `;
}
