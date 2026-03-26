/**
 * Welcome view — shown when no tabs are open
 */
import { h } from 'preact';
import { html } from 'htm/preact';
import { useState, useEffect } from 'preact/hooks';

import { getStats } from '../../shared/api-client.js';
import { DashboardStats } from '../../shared/types.js';
import { activeSidebar, sidebarVisible, openTab } from '../../shared/state.js';

export function WelcomeView() {
  const [stats, setStats] = useState<DashboardStats | null>(null);

  useEffect(() => {
    getStats().then(setStats);
  }, []);

  return html`
    <div class="welcome-view">
      <div class="welcome-header">
        <h1 class="welcome-title">BlueDolphin Inzicht</h1>
        <p class="welcome-subtitle">Architectuur, impact & patroondetectie</p>
      </div>

      ${stats && html`
        <div class="welcome-stats">
          <div class="welcome-stat">
            <div class="welcome-stat-value">${stats.apps}</div>
            <div class="welcome-stat-label">Applicaties</div>
          </div>
          <div class="welcome-stat">
            <div class="welcome-stat-value">${stats.processes}</div>
            <div class="welcome-stat-label">Processen</div>
          </div>
          <div class="welcome-stat">
            <div class="welcome-stat-value">${stats.actors}</div>
            <div class="welcome-stat-label">Actoren</div>
          </div>
          <div class="welcome-stat">
            <div class="welcome-stat-value">${stats.relations}</div>
            <div class="welcome-stat-label">Relaties</div>
          </div>
          <div class="welcome-stat">
            <div class="welcome-stat-value">${stats.objects}</div>
            <div class="welcome-stat-label">Totaal objecten</div>
          </div>
        </div>
      `}

      <div class="welcome-actions">
        <div class="welcome-action" onClick=${() => { activeSidebar.value = 'portfolio'; sidebarVisible.value = true; }}>
          <span class="welcome-action-icon" dangerouslySetInnerHTML=${{ __html: '<svg width="24" height="24" viewBox="0 0 16 16" fill="currentColor"><path d="M1.5 1h5v5h-5V1zm1 1v3h3V2h-3zm6.5-1h5v5h-5V1zm1 1v3h3V2h-3zM1.5 8h5v5h-5V8zm1 1v3h3V9h-3zm6.5-1h5v5h-5V8zm1 1v3h3V9h-3z"/></svg>' }} />
          <div>
            <div class="welcome-action-title">Portfolio verkennen</div>
            <div class="welcome-action-desc">Blader door alle objecten per type</div>
          </div>
        </div>
        <div class="welcome-action" onClick=${() => { activeSidebar.value = 'impact'; sidebarVisible.value = true; }}>
          <span class="welcome-action-icon" dangerouslySetInnerHTML=${{ __html: '<svg width="24" height="24" viewBox="0 0 16 16" fill="currentColor"><path d="M9.3 1L4 8.5h3.2L5.7 15 12 7H8.5L9.3 1zm-.8 1.6L8 6h2.8L7.2 11.4 8.4 7.5H5.4l3.1-4.9z"/></svg>' }} />
          <div>
            <div class="welcome-action-title">Impact analyse</div>
            <div class="welcome-action-desc">Analyseer de impact van een storing</div>
          </div>
        </div>
        <div class="welcome-action" onClick=${() => { activeSidebar.value = 'incidents'; sidebarVisible.value = true; }}>
          <span class="welcome-action-icon" dangerouslySetInnerHTML=${{ __html: '<svg width="24" height="24" viewBox="0 0 16 16" fill="currentColor"><path d="M13.964 12.315L13 9.902V6.001C13 3.244 10.757 1.001 8 1.001C5.243 1.001 3 3.243 3 6V9.901L2.036 12.314C1.974 12.468 1.993 12.642 2.086 12.78C2.179 12.917 2.334 13 2.5 13H6C6 14.108 6.892 15 8 15C9.108 15 10 14.108 10 13H13.5C13.666 13 13.821 12.918 13.914 12.78C14.007 12.643 14.026 12.469 13.964 12.315ZM8 14C7.444 14 7 13.556 7 13H9C9 13.556 8.556 14 8 14ZM3.238 12L3.964 10.183C3.988 10.124 4 10.061 4 9.997V5.999C4 3.793 5.794 1.999 8 1.999C10.206 1.999 12 3.793 12 5.999V9.997C12 10.061 12.012 10.124 12.036 10.183L12.762 12H3.238Z"/></svg>' }} />
          <div>
            <div class="welcome-action-title">Incident melden</div>
            <div class="welcome-action-desc">Registreer een nieuwe storing</div>
          </div>
        </div>
        <div class="welcome-action" onClick=${() => openTab('__infra-topology__', 'Netwerktopologie', '__infra__')}>
          <span class="welcome-action-icon" dangerouslySetInnerHTML=${{ __html: '<svg width="24" height="24" viewBox="0 0 16 16" fill="currentColor"><circle cx="4" cy="4" r="2"/><circle cx="12" cy="4" r="2"/><circle cx="4" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><path d="M6 4h4M6 12h4M4 6v4M12 6v4" stroke="currentColor" stroke-width="1" fill="none"/></svg>' }} />
          <div>
            <div class="welcome-action-title">Netwerktopologie</div>
            <div class="welcome-action-desc">Infrastructuur: devices, netwerken, locaties</div>
          </div>
        </div>
      </div>

      <div class="welcome-shortcuts">
        <div class="welcome-shortcut"><kbd>Ctrl+P</kbd> Zoek overal</div>
        <div class="welcome-shortcut"><kbd>Ctrl+B</kbd> Sidebar toggle</div>
        <div class="welcome-shortcut"><kbd>Ctrl+J</kbd> Panel toggle</div>
      </div>
    </div>
  `;
}
