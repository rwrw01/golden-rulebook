/**
 * Editor area — manages tab content rendering
 */
import { h } from 'preact';
import { html } from 'htm/preact';

import { activeTab, tabs } from '../shared/state.js';
import { AppView } from './views/app-view.js';
import { GenericView } from './views/generic-view.js';
import { WelcomeView } from './views/welcome-view.js';
import { InfraTopologyView } from './views/infra-topology-view.js';
import { SettingsView } from './views/settings-view.js';
import { DashboardView } from './views/dashboard-view.js';
import { GgmDetail } from './ggm-detail.js';

export function EditorArea() {
  const tab = activeTab.value;

  if (!tab || tabs.value.length === 0) {
    return html`<${WelcomeView} />`;
  }

  // Special views (virtual tabs)
  if (tab.objectId === '__infra-topology__') {
    return html`<${InfraTopologyView} />`;
  }
  if (tab.objectId === '__settings__') {
    return html`<${SettingsView} />`;
  }
  if (tab.objectId.startsWith('__dash_')) {
    const viewId = tab.objectId.replace('__dash_', '');
    return html`<${DashboardView} key=${viewId} viewId=${viewId} />`;
  }
  if (tab.objectId.startsWith('__ggm_')) {
    const domainId = tab.objectId.replace('__ggm_', '');
    return html`<${GgmDetail} key=${domainId} domainId=${domainId} />`;
  }

  if (tab.typeName === 'Applicatie') {
    return html`<${AppView} key=${tab.objectId} objectId=${tab.objectId} title=${tab.title} />`;
  }

  return html`<${GenericView} key=${tab.objectId} objectId=${tab.objectId} title=${tab.title} typeName=${tab.typeName} />`;
}
