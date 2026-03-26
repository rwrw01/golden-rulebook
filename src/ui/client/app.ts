/**
 * BlueDolphin SPA — Main application shell
 * VS Code-inspired 5-zone layout: Activity Bar + Sidebar + Editor + Panel + Status Bar
 */
import { render, h } from 'preact';
import { html } from 'htm/preact';
import { signal } from '@preact/signals';

import {
  activeSidebar, sidebarVisible, panelVisible,
  tabs, activeTabId, activeTab, activePanelTab,
  breadcrumbs, openTab, closeTab, navigateToObject,
} from './shared/state.js';
import { TYPE_COLORS, SidebarView } from './shared/types.js';
import { registerShortcut, initKeyboard } from './shared/keyboard.js';

import { PortfolioSidebar } from './sidebar/portfolio.js';
import { RelationsSidebar } from './sidebar/relations.js';
import { IncidentsSidebar } from './sidebar/incidents.js';
import { DashboardSidebar } from './sidebar/dashboard.js';
import { AiSidebar } from './sidebar/ai-assistant.js';
import { GgmSidebar } from './sidebar/ggm.js';

import { EditorArea } from './editor/tab-manager.js';
import { ChatPanel } from './panel/chat-panel.js';
import { PropertiesPanel } from './panel/properties.js';
import { CommandPalette, togglePalette, paletteOpen } from './shared/command-palette.js';

// Resize state
const sidebarWidth = signal(280);
const panelHeight = signal(280);

// Horizontal resize handle (for sidebar)
function ResizeHandleH() {
  const handleMouseDown = (e: MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = sidebarWidth.value;
    const onMove = (ev: MouseEvent) => {
      sidebarWidth.value = Math.max(180, Math.min(500, startW + (ev.clientX - startX)));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  return html`<div class="resize-handle-h" onMouseDown=${handleMouseDown} />`;
}

// Vertical resize handle (for panel)
function ResizeHandleV() {
  const handleMouseDown = (e: MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = panelHeight.value;
    const onMove = (ev: MouseEvent) => {
      panelHeight.value = Math.max(100, Math.min(600, startH + (startY - ev.clientY)));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  return html`<div class="resize-handle-v" onMouseDown=${handleMouseDown} />`;
}

// SVG icons — Codicon style: 16x16 viewBox, fill="currentColor", monochrome
const ICONS = {
  // Portfolio: 2x2 grid of files
  portfolio: '<svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor"><path d="M1.5 1h5v5h-5V1zm1 1v3h3V2h-3zm6.5-1h5v5h-5V1zm1 1v3h3V2h-3zM1.5 8h5v5h-5V8zm1 1v3h3V9h-3zm6.5-1h5v5h-5V8zm1 1v3h3V9h-3z"/></svg>',
  // Relaties: network (3 connected nodes)
  relations: '<svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="3" r="1.8"/><circle cx="3.5" cy="12" r="1.8"/><circle cx="12.5" cy="12" r="1.8"/><path d="M7.2 4.5L4.3 10.5" stroke="currentColor" stroke-width="1" fill="none"/><path d="M8.8 4.5L11.7 10.5" stroke="currentColor" stroke-width="1" fill="none"/><path d="M5.3 12L10.7 12" stroke="currentColor" stroke-width="1" fill="none"/></svg>',
  // Incidenten: bell (from Codicon)
  incidents: '<svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor"><path d="M13.964 12.315L13 9.902V6.001C13 3.244 10.757 1.001 8 1.001C5.243 1.001 3 3.243 3 6V9.901L2.036 12.314C1.974 12.468 1.993 12.642 2.086 12.78C2.179 12.917 2.334 13 2.5 13H6C6 14.108 6.892 15 8 15C9.108 15 10 14.108 10 13H13.5C13.666 13 13.821 12.918 13.914 12.78C14.007 12.643 14.026 12.469 13.964 12.315ZM8 14C7.444 14 7 13.556 7 13H9C9 13.556 8.556 14 8 14ZM3.238 12L3.964 10.183C3.988 10.124 4 10.061 4 9.997V5.999C4 3.793 5.794 1.999 8 1.999C10.206 1.999 12 3.793 12 5.999V9.997C12 10.061 12.012 10.124 12.036 10.183L12.762 12H3.238Z"/></svg>',
  // Dashboard: bar chart (from Codicon graph icon)
  dashboard: '<svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor"><path fill-rule="evenodd" clip-rule="evenodd" d="M12.25 15H13.75C14.439 15 15 14.439 15 13.75V2.25C15 1.561 14.439 1 13.75 1H12.25C11.561 1 11 1.561 11 2.25V13.75C11 14.439 11.561 15 12.25 15ZM12 2.25C12 2.112 12.112 2 12.25 2H13.75C13.888 2 14 2.112 14 2.25V13.75C14 13.888 13.888 14 13.75 14H12.25C12.112 14 12 13.888 12 13.75V2.25Z"/><path fill-rule="evenodd" clip-rule="evenodd" d="M7.25 15H8.75C9.439 15 10 14.439 10 13.75V6.25C10 5.561 9.439 5 8.75 5H7.25C6.561 5 6 5.561 6 6.25V13.75C6 14.439 6.561 15 7.25 15ZM7 6.25C7 6.112 7.112 6 7.25 6H8.75C8.888 6 9 6.112 9 6.25V13.75C9 13.888 8.888 14 8.75 14H7.25C7.112 14 7 13.888 7 13.75V6.25Z"/><path fill-rule="evenodd" clip-rule="evenodd" d="M2.25 15H3.75C4.439 15 5 14.439 5 13.75V8.25C5 7.561 4.439 7 3.75 7H2.25C1.561 7 1 7.561 1 8.25V13.75C1 14.439 1.561 15 2.25 15ZM2 8.25C2 8.112 2.112 8 2.25 8H3.75C3.888 8 4 8.112 4 8.25V13.75C4 13.888 3.888 14 3.75 14H2.25C2.112 14 2 13.888 2 13.75V8.25Z"/></svg>',
  // AI: sparkle (from Codicon)
  ai: '<svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor"><path d="M5.47 9.83C5.62 9.94 5.81 10 6 10C6.19 10 6.38 9.94 6.54 9.83C6.69 9.71 6.81 9.55 6.88 9.37L7.22 8.3C7.31 8.05 7.45 7.82 7.64 7.64C7.82 7.45 8.05 7.31 8.3 7.22L9.39 6.87C9.57 6.81 9.72 6.69 9.83 6.53C9.94 6.38 10 6.19 10 6C10 5.81 9.94 5.63 9.83 5.47C9.71 5.31 9.54 5.18 9.35 5.12L8.28 4.78C8.03 4.69 7.8 4.55 7.61 4.36C7.43 4.18 7.29 3.95 7.2 3.7L6.85 2.61C6.79 2.43 6.67 2.28 6.51 2.17C6.36 2.06 6.17 2 5.98 2C5.79 2 5.6 2.06 5.45 2.17C5.29 2.28 5.17 2.44 5.1 2.63L4.75 3.72C4.66 3.96 4.53 4.18 4.35 4.37C4.16 4.55 3.94 4.69 3.7 4.78L2.62 5.13C2.43 5.19 2.28 5.31 2.17 5.47C2.06 5.62 2 5.81 2 6C2 6.2 2.06 6.38 2.18 6.54C2.29 6.69 2.45 6.81 2.63 6.87L3.7 7.22C3.95 7.3 4.18 7.45 4.36 7.63C4.55 7.82 4.72 8.05 4.78 8.3L5.13 9.38C5.19 9.56 5.31 9.72 5.47 9.83ZM10.53 13.85C10.67 13.95 10.83 14 11 14C11.16 14 11.32 13.95 11.46 13.85C11.6 13.75 11.7 13.61 11.76 13.45L12.01 12.69C12.06 12.53 12.15 12.39 12.27 12.27C12.38 12.15 12.53 12.06 12.69 12.01L13.46 11.76C13.62 11.7 13.75 11.6 13.85 11.46C13.95 11.32 14 11.16 14 11C14 10.84 13.95 10.68 13.85 10.54C13.75 10.4 13.6 10.29 13.44 10.23L12.67 9.99C12.51 9.93 12.37 9.84 12.25 9.73C12.13 9.61 12.04 9.47 11.99 9.31L11.74 8.53C11.69 8.38 11.58 8.24 11.45 8.14C11.32 8.04 11.16 8 11 8C10.84 8 10.68 8.05 10.54 8.14C10.4 8.24 10.29 8.38 10.22 8.54L9.97 9.31C9.92 9.46 9.83 9.61 9.72 9.73C9.6 9.84 9.46 9.93 9.31 9.99L8.53 10.24C8.38 10.29 8.24 10.39 8.14 10.54C8.05 10.68 8 10.84 8 11C8 11.16 8.05 11.32 8.15 11.46C8.24 11.6 8.38 11.7 8.55 11.76L9.31 12.01C9.47 12.06 9.61 12.15 9.73 12.27C9.85 12.39 9.94 12.53 9.99 12.69L10.24 13.46C10.3 13.62 10.4 13.76 10.53 13.85Z"/></svg>',
  // GGM: hierarchy/domain grid (3 columns representing domains)
  ggm: '<svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="1" width="4" height="4" rx="0.5"/><rect x="6" y="1" width="4" height="4" rx="0.5"/><rect x="11" y="1" width="4" height="4" rx="0.5"/><rect x="1" y="7" width="4" height="4" rx="0.5"/><rect x="6" y="7" width="4" height="4" rx="0.5"/><rect x="11" y="7" width="4" height="4" rx="0.5"/><rect x="3.5" y="5" width="1" height="2"/><rect x="8.5" y="5" width="1" height="2"/><rect x="13.5" y="5" width="1" height="2"/></svg>',
  // Settings: gear
  settings: '<svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor"><path d="M9.1 4.4L8.6 2H7.4L6.9 4.4L6.2 4.7L4.2 3.3L3.3 4.2L4.7 6.2L4.4 6.9L2 7.4V8.6L4.4 9.1L4.7 9.8L3.3 11.8L4.2 12.7L6.2 11.3L6.9 11.6L7.4 14H8.6L9.1 11.6L9.8 11.3L11.8 12.7L12.7 11.8L11.3 9.8L11.6 9.1L14 8.6V7.4L11.6 6.9L11.3 6.2L12.7 4.2L11.8 3.3L9.8 4.7L9.1 4.4ZM9.4 1L9.9 3.4C10 3.5 10.2 3.5 10.3 3.6L12.4 2.1L13.9 3.6L12.4 5.7C12.5 5.8 12.5 6 12.6 6.1L15 6.6V8.4L12.6 8.9C12.5 9 12.5 9.2 12.4 9.3L13.9 11.4L12.4 12.9L10.3 11.4C10.2 11.5 10 11.5 9.9 11.6L9.4 14H7.6L7.1 11.6C7 11.5 6.8 11.5 6.7 11.4L4.6 12.9L3.1 11.4L4.6 9.3C4.5 9.2 4.5 9 4.4 8.9L2 8.4V6.6L4.4 6.1C4.5 6 4.5 5.8 4.6 5.7L3.1 3.6L4.6 2.1L6.7 3.6C6.8 3.5 7 3.5 7.1 3.4L7.6 1H9.4ZM8 10C9.1 10 10 9.1 10 8C10 6.9 9.1 6 8 6C6.9 6 6 6.9 6 8C6 9.1 6.9 10 8 10ZM8 9C7.4 9 7 8.6 7 8C7 7.4 7.4 7 8 7C8.6 7 9 7.4 9 8C9 8.6 8.6 9 8 9Z"/></svg>',
};

// Activity bar items
const ACTIVITY_ITEMS: Array<{ id: SidebarView; icon: string; label: string }> = [
  { id: 'portfolio', icon: ICONS.portfolio, label: 'Portfolio' },
  { id: 'relations', icon: ICONS.relations, label: 'Relaties' },
  { id: 'incidents', icon: ICONS.incidents, label: 'Incidenten' },
  { id: 'dashboard', icon: ICONS.dashboard, label: 'Dashboard' },
  { id: 'ai', icon: ICONS.ai, label: 'AI Assistent' },
  { id: 'ggm', icon: ICONS.ggm, label: 'GGM Domeinen' },
];

function ActivityBar() {
  return html`
    <div class="activity-bar">
      ${ACTIVITY_ITEMS.map(item => html`
        <button
          class="activity-btn ${activeSidebar.value === item.id ? 'active' : ''}"
          onClick=${() => {
            if (activeSidebar.value === item.id) {
              sidebarVisible.value = !sidebarVisible.value;
            } else {
              activeSidebar.value = item.id;
              sidebarVisible.value = true;
            }
          }}
          title=${item.label}
        >
          <span class="activity-icon" dangerouslySetInnerHTML=${{ __html: item.icon }} />
        </button>
      `)}
      <div class="activity-spacer" />
      <button class="activity-btn" title="Instellingen" onClick=${() => openTab('__settings__', 'Instellingen', '__settings__')}>
        <span class="activity-icon" dangerouslySetInnerHTML=${{ __html: ICONS.settings }} />
      </button>
    </div>
  `;
}

function Sidebar() {
  if (!sidebarVisible.value) return null;

  const view = activeSidebar.value;
  const title = ACTIVITY_ITEMS.find(i => i.id === view)?.label ?? '';
  return html`
    <div class="sidebar" style="width: ${sidebarWidth.value}px">
      <div class="sidebar-header">
        <span class="sidebar-title">${title}</span>
      </div>
      <div class="sidebar-content">
        ${view === 'portfolio' && html`<${PortfolioSidebar} />`}
        ${view === 'relations' && html`<${RelationsSidebar} />`}
        ${view === 'incidents' && html`<${IncidentsSidebar} />`}
        ${view === 'dashboard' && html`<${DashboardSidebar} />`}
        ${view === 'ai' && html`<${AiSidebar} />`}
        ${view === 'ggm' && html`<${GgmSidebar} />`}
      </div>
      <${ResizeHandleH} />
    </div>
  `;
}

function TabBar() {
  return html`
    <div class="tab-bar">
      ${tabs.value.map(tab => html`
        <div
          class="tab ${activeTabId.value === tab.id ? 'active' : ''}"
          onClick=${() => { activeTabId.value = tab.id; }}
          onDblClick=${() => { const t = tabs.value.find(tt => tt.id === tab.id); if (t) { t.pinned = true; tabs.value = [...tabs.value]; } }}
        >
          <span class="tab-dot" style="background: ${TYPE_COLORS[tab.typeName] ?? '#666'}" />
          <span class="tab-title ${tab.pinned ? '' : 'tab-preview'}">${tab.title}</span>
          <button class="tab-close" onClick=${(e: Event) => { e.stopPropagation(); closeTab(tab.id); }}>×</button>
        </div>
      `)}
    </div>
  `;
}

function Breadcrumbs() {
  const crumbs = breadcrumbs.value;
  if (crumbs.length === 0) return null;

  return html`
    <div class="breadcrumbs">
      ${crumbs.map((crumb, i) => html`
        ${i > 0 && html`<span class="breadcrumb-sep">${crumb.relationLabel ? ` › ${crumb.relationLabel} › ` : ' › '}</span>`}
        <a class="breadcrumb-item" onClick=${() => navigateToObject(crumb.objectId, crumb.title, crumb.typeName)}>
          <span class="breadcrumb-dot" style="background: ${TYPE_COLORS[crumb.typeName] ?? '#666'}" />
          ${crumb.title}
        </a>
      `)}
    </div>
  `;
}

function Panel() {
  if (!panelVisible.value) return null;
  return html`
    <div class="panel" style="height: ${panelHeight.value}px">
      <${ResizeHandleV} />
      <div class="panel-tabs">
        <button class="panel-tab ${activePanelTab.value === 'chat' ? 'active' : ''}" onClick=${() => { activePanelTab.value = 'chat'; }}>AI Chat</button>
        <button class="panel-tab ${activePanelTab.value === 'properties' ? 'active' : ''}" onClick=${() => { activePanelTab.value = 'properties'; }}>Properties</button>
        <div class="panel-spacer" />
        <button class="panel-close" onClick=${() => { panelVisible.value = false; }}>×</button>
      </div>
      <div class="panel-content">
        ${activePanelTab.value === 'chat' && html`<${ChatPanel} />`}
        ${activePanelTab.value === 'properties' && html`<${PropertiesPanel} />`}
      </div>
    </div>
  `;
}

function StatusBar() {
  return html`
    <div class="status-bar">
      <span class="status-item">BlueDolphin Inzicht</span>
      <span class="status-spacer" />
      <span class="status-item">Ctrl+P Zoeken</span>
      <span class="status-item">Ctrl+B Sidebar</span>
      <span class="status-item">Ctrl+J Panel</span>
    </div>
  `;
}

function App() {
  return html`
    <div class="app-shell ${sidebarVisible.value ? 'sidebar-open' : 'sidebar-closed'}">
      <${ActivityBar} />
      <${Sidebar} />
      <div class="main-area">
        <${TabBar} />
        <${Breadcrumbs} />
        <div class="editor-area">
          <${EditorArea} />
        </div>
        <${Panel} />
      </div>
      <${StatusBar} />
      <${CommandPalette} onClose=${() => { paletteOpen.value = false; }} />
    </div>
  `;
}

function init(): void {
  registerShortcut({ key: 'p', ctrl: true, handler: togglePalette, description: 'Command Palette' });
  registerShortcut({ key: 'b', ctrl: true, handler: () => { sidebarVisible.value = !sidebarVisible.value; }, description: 'Toggle sidebar' });
  registerShortcut({ key: 'j', ctrl: true, handler: () => { panelVisible.value = !panelVisible.value; }, description: 'Toggle panel' });
  registerShortcut({ key: 'w', ctrl: true, handler: () => { if (activeTabId.value) closeTab(activeTabId.value); }, description: 'Sluit tab' });

  initKeyboard();

  const root = document.getElementById('app');
  if (root) render(html`<${App} />`, root);
}

init();
