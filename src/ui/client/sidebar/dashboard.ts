/**
 * Dashboard sidebar — KPI selector
 */
import { h } from 'preact';
import { html } from 'htm/preact';
import { useState, useEffect } from 'preact/hooks';

import { getStats } from '../shared/api-client.js';
import { DashboardStats } from '../shared/types.js';
import { openTab } from '../shared/state.js';

type DashboardView = 'overview' | 'locations' | 'coverage' | 'risks';

export const selectedDashboard = { value: 'overview' as DashboardView };

const DASH_LABELS: Record<string, string> = {
  overview: 'Portfolio overzicht',
  locations: 'Locatieverdeling',
  coverage: 'Relatiedekking',
  risks: 'Risico-indicatoren',
};

export function DashboardSidebar() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [active, setActive] = useState<DashboardView>('overview');

  useEffect(() => {
    getStats().then(setStats);
  }, []);

  const dashboards: Array<{ id: DashboardView; label: string; description: string }> = [
    { id: 'overview', label: 'Portfolio overzicht', description: 'Totaalbeeld van alle objecten en relaties' },
    { id: 'locations', label: 'Locatieverdeling', description: 'Cloud vs On-premise verdeling' },
    { id: 'coverage', label: 'Relatiedekking', description: 'Objecten zonder relaties' },
    { id: 'risks', label: 'Risico-indicatoren', description: 'Applicaties zonder processen of actoren' },
  ];

  return html`
    <div class="dashboard-sidebar">
      ${stats && html`
        <div class="sidebar-stats">
          <div class="mini-stat"><span class="mini-value">${stats.apps}</span><span class="mini-label">Apps</span></div>
          <div class="mini-stat"><span class="mini-value">${stats.processes}</span><span class="mini-label">Processen</span></div>
          <div class="mini-stat"><span class="mini-value">${stats.actors}</span><span class="mini-label">Actoren</span></div>
          <div class="mini-stat"><span class="mini-value">${stats.relations}</span><span class="mini-label">Relaties</span></div>
        </div>
      `}

      <div class="section-label">Dashboards</div>
      ${dashboards.map(d => html`
        <div
          class="dashboard-item ${active === d.id ? 'active' : ''}"
          onClick=${() => { setActive(d.id); selectedDashboard.value = d.id; openTab('__dash_' + d.id, DASH_LABELS[d.id] ?? d.label, '__dashboard__'); }}
        >
          <div class="dashboard-item-title">${d.label}</div>
          <div class="dashboard-item-desc">${d.description}</div>
        </div>
      `)}
    </div>
  `;
}
