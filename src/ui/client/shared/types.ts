/**
 * Shared TypeScript interfaces for the BlueDolphin SPA
 */

export interface BdObject {
  id: string;
  title: string;
  type_name: string;
}

export interface BdRelation {
  id: string;
  title: string;
  type: string;
  relationship_name: string;
  relationship_type: string;
}

export interface ImpactResult {
  app: { id: string; title: string };
  locations: Array<{ id: string; title: string }>;
  processes: Array<{ id: string; title: string }>;
  functions: Array<{ id: string; title: string }>;
  actors: Array<{ id: string; title: string }>;
  dependencies: Array<{ id: string; title: string; direction: string }>;
  infrastructure: Array<{ id: string; title: string; type: string }>;
}

export interface GraphData {
  nodes: Array<{ id: string; title: string; type: string }>;
  edges: Array<{ source: string; target: string; label: string; type: string }>;
}

export interface DashboardStats {
  objects: number;
  apps: number;
  relations: number;
  processes: number;
  actors: number;
  types: Array<{ name: string; n: number }>;
}

export interface TabInfo {
  id: string;
  objectId: string;
  title: string;
  typeName: string;
  pinned: boolean;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export type SidebarView = 'portfolio' | 'relations' | 'incidents' | 'dashboard' | 'ai' | 'ggm';
export type PanelTab = 'chat' | 'properties';

export const TYPE_COLORS: Record<string, string> = {
  'Applicatie': '#4f8ff7',
  'Bedrijfsproces': '#f59e0b',
  'Bedrijfsfunctie': '#a855f7',
  'Actor': '#22c55e',
  'Locatie': '#06b6d4',
  'Database': '#ef4444',
  'Node': '#ec4899',
  'Package': '#8b5cf6',
  'Applicatie-interface': '#14b8a6',
  'Gegevensobject': '#f97316',
  'Bedrijfsobject': '#eab308',
  'Applicatieservice': '#6366f1',
  'Referentiecomponent': '#84cc16',
};
