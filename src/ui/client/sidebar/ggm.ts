/**
 * GGM sidebar — Gemeentelijk Gegevensmodel domain overview
 */
import { h } from 'preact';
import { html } from 'htm/preact';
import { useState, useEffect } from 'preact/hooks';

import { openTab } from '../shared/state.js';

interface GgmDomain {
  id: string;
  name: string;
  color: string;
  appCount: number;
  functionCount: number;
}

interface GgmOverview {
  domains: GgmDomain[];
  unclassified: { appCount: number; functionCount: number };
}

export function GgmSidebar() {
  const [overview, setOverview] = useState<GgmOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeDomainId, setActiveDomainId] = useState<string | null>(null);

  useEffect(() => {
    loadOverview();
  }, []);

  async function loadOverview(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/ggm');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as GgmOverview;
      setOverview(data);
    } catch (err) {
      setError('Kon GGM domeinen niet laden');
    } finally {
      setLoading(false);
    }
  }

  function openDomain(domain: GgmDomain): void {
    setActiveDomainId(domain.id);
    openTab('__ggm_' + domain.id, domain.name, '__ggm__');
  }

  function openUnclassified(): void {
    setActiveDomainId('__unclassified__');
    openTab('__ggm___unclassified__', 'Niet geclassificeerd', '__ggm__');
  }

  if (loading) return html`<div class="sidebar-loading">Laden...</div>`;
  if (error) return html`<div class="sidebar-error">${error}</div>`;
  if (!overview) return null;

  return html`
    <div class="ggm-sidebar">
      <div class="section-label">GGM Domeinen</div>
      <div class="ggm-domain-list">
        ${overview.domains.map(domain => html`
          <div
            class="ggm-domain-item ${activeDomainId === domain.id ? 'active' : ''}"
            onClick=${() => openDomain(domain)}
          >
            <span class="ggm-dot" style="background: ${domain.color}" />
            <span class="ggm-domain-name">${domain.name}</span>
            <span class="tree-count">${domain.appCount}</span>
          </div>
        `)}
        <div
          class="ggm-domain-item ${activeDomainId === '__unclassified__' ? 'active' : ''}"
          onClick=${() => openUnclassified()}
        >
          <span class="ggm-dot" style="background: #666" />
          <span class="ggm-domain-name">Niet geclassificeerd</span>
          <span class="tree-count">${overview.unclassified.appCount}</span>
        </div>
      </div>
    </div>
  `;
}
