/**
 * Client-side state management
 * Simple reactive store using Preact signals pattern
 */
import { signal, computed } from '@preact/signals';

import { TabInfo, SidebarView, PanelTab, ChatMessage } from './types.js';

// Sidebar
export const activeSidebar = signal<SidebarView>('portfolio');
export const sidebarVisible = signal(true);

// Tabs
export const tabs = signal<TabInfo[]>([]);
export const activeTabId = signal<string | null>(null);
export const activeTab = computed(() => tabs.value.find(t => t.id === activeTabId.value) ?? null);

// Panel
export const panelVisible = signal(true);
export const activePanelTab = signal<PanelTab>('chat');

// Chat
export const chatHistory = signal<ChatMessage[]>([]);
export const chatStreaming = signal(false);

// Portfolio filter
export const portfolioFilter = signal('');

// Impact
export const impactQuery = signal('');

// Relations filters
export const relationTypeFilter = signal<string[]>([]);
export const relationDepth = signal(1);

// Breadcrumb
export interface BreadcrumbEntry {
  objectId: string;
  title: string;
  typeName: string;
  relationLabel?: string;
}
export const breadcrumbs = signal<BreadcrumbEntry[]>([]);

export function openTab(objectId: string, title: string, typeName: string): void {
  const existing = tabs.value.find(t => t.objectId === objectId);
  if (existing) {
    activeTabId.value = existing.id;
    return;
  }

  const id = `tab-${Date.now()}`;
  const newTab: TabInfo = { id, objectId, title, typeName, pinned: false };
  tabs.value = [...tabs.value, newTab];
  activeTabId.value = id;

  breadcrumbs.value = [{ objectId, title, typeName }];
}

export function closeTab(tabId: string): void {
  const idx = tabs.value.findIndex(t => t.id === tabId);
  tabs.value = tabs.value.filter(t => t.id !== tabId);

  if (activeTabId.value === tabId) {
    if (tabs.value.length === 0) {
      activeTabId.value = null;
    } else {
      activeTabId.value = tabs.value[Math.min(idx, tabs.value.length - 1)].id;
    }
  }
}

export function navigateToObject(objectId: string, title: string, typeName: string, relationLabel?: string): void {
  openTab(objectId, title, typeName);

  const current = breadcrumbs.value;
  const existingIdx = current.findIndex(b => b.objectId === objectId);
  if (existingIdx >= 0) {
    breadcrumbs.value = current.slice(0, existingIdx + 1);
  } else {
    breadcrumbs.value = [...current, { objectId, title, typeName, relationLabel }];
  }
}
