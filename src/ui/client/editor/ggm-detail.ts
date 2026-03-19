/**
 * GGM detail view — applications per domain grouped by bedrijfsfunctie
 */
import { h } from 'preact';
import { html } from 'htm/preact';
import { useState, useEffect } from 'preact/hooks';

import { navigateToObject } from '../shared/state.js';

interface GgmApp {
  id: string;
  title: string;
}

interface GgmFunction {
  id: string;
  title: string;
  apps: GgmApp[];
}

interface GgmDomainDetail {
  domain: { id: string; name: string; color: string };
  functions: GgmFunction[];
  apps?: GgmApp[];
}

export function GgmDetail({ domainId }: { domainId: string }) {
  const [detail, setDetail] = useState<GgmDomainDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadDetail(domainId);
  }, [domainId]);

  async function loadDetail(id: string): Promise<void> {
    setLoading(true);
    setError(null);
    setDetail(null);
    try {
      const res = await fetch(`/api/ggm?domain=${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as GgmDomainDetail;
      setDetail(data);
    } catch (err) {
      setError('Kon domeindetail niet laden');
    } finally {
      setLoading(false);
    }
  }

  function toggleCollapse(fnId: string): void {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(fnId)) {
        next.delete(fnId);
      } else {
        next.add(fnId);
      }
      return next;
    });
  }

  if (loading) return html`<div class="dashboard-loading">Laden...</div>`;
  if (error) return html`<div class="dashboard-loading">${error}</div>`;
  if (!detail) return null;

  const fnApps = detail.functions.reduce((sum, fn) => sum + fn.apps.length, 0);
  const directApps = detail.apps ?? [];
  const totalApps = fnApps + directApps.length;

  return html`
    <div class="dash-content">
      <div class="ggm-domain-banner" style="border-left: 4px solid ${detail.domain.color}; padding-left: 12px; margin-bottom: 16px">
        <h2 class="dash-title" style="margin: 0; color: ${detail.domain.color}">${detail.domain.name}</h2>
        <p class="dash-subtitle" style="margin: 4px 0 0">${totalApps} applicaties in ${detail.functions.length} bedrijfsfuncties</p>
      </div>

      ${detail.functions.length === 0 && directApps.length === 0 && html`
        <div class="dashboard-loading">Geen applicaties gevonden voor dit domein.</div>
      `}

      ${directApps.length > 0 && html`
        <div class="ggm-function-group">
          <div class="tree-group-header" style="padding: 6px 8px">
            <span class="ggm-dot" style="background: #4f8ff7" />
            <span class="tree-label">Applicaties</span>
            <span class="tree-count">${directApps.length}</span>
          </div>
          <div class="tree-items">
            ${directApps.map(app => html`
              <div
                class="tree-item clickable"
                onClick=${() => navigateToObject(app.id, app.title, 'Applicatie')}
              >
                <span class="ggm-dot" style="background: #4f8ff7; margin-right: 6px" />
                ${app.title}
              </div>
            `)}
          </div>
        </div>
      `}

      <div class="ggm-functions">
        ${detail.functions.map(fn => html`
          <div class="ggm-function-group">
            <div
              class="tree-group-header"
              onClick=${() => toggleCollapse(fn.id)}
              style="cursor: pointer; padding: 6px 8px"
            >
              <span class="tree-arrow">${collapsed.has(fn.id) ? '▶' : '▼'}</span>
              <span class="ggm-dot" style="background: #a855f7" />
              <span class="tree-label">${fn.title}</span>
              <span class="tree-count">${fn.apps.length}</span>
            </div>
            ${!collapsed.has(fn.id) && html`
              <div class="tree-items">
                ${fn.apps.map(app => html`
                  <div
                    class="tree-item clickable"
                    onClick=${() => navigateToObject(app.id, app.title, 'Applicatie')}
                  >
                    <span class="ggm-dot" style="background: #4f8ff7; margin-right: 6px" />
                    ${app.title}
                  </div>
                `)}
                ${fn.apps.length === 0 && html`
                  <div class="tree-item" style="color: var(--dim); font-style: italic">Geen applicaties</div>
                `}
              </div>
            `}
          </div>
        `)}
      </div>
    </div>
  `;
}
