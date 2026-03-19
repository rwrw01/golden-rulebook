/**
 * API client for all /api/ endpoints
 */
import { BdObject, BdRelation, ImpactResult, GraphData, DashboardStats } from './types.js';

const BASE = '';

export async function searchObjects(query: string): Promise<BdObject[]> {
  const res = await fetch(`${BASE}/api/search?q=${encodeURIComponent(query)}`);
  return res.json();
}

export async function getImpact(id: string): Promise<ImpactResult | null> {
  const res = await fetch(`${BASE}/api/impact?id=${encodeURIComponent(id)}`);
  if (!res.ok) return null;
  return res.json();
}

export async function getGraph(id: string, depth = 1, types?: string[]): Promise<GraphData> {
  const params = new URLSearchParams({ id, depth: String(depth) });
  if (types?.length) params.set('types', types.join(','));
  const res = await fetch(`${BASE}/api/graph?${params}`);
  return res.json();
}

export async function getObject(id: string): Promise<{ object: BdObject; relations: BdRelation[] } | null> {
  const res = await fetch(`${BASE}/api/object/${encodeURIComponent(id)}`);
  if (!res.ok) return null;
  return res.json();
}

export async function getObjects(type?: string, query?: string): Promise<BdObject[]> {
  const params = new URLSearchParams();
  if (type) params.set('type', type);
  if (query) params.set('q', query);
  const res = await fetch(`${BASE}/api/objects?${params}`);
  return res.json();
}

export interface InfraDevice {
  id: string;
  title: string;
  networks: string[];
  children: Array<{ id: string; title: string; networks: string[] }>;
  location: { id: string; title: string } | null;
}

export interface InfraTopology {
  networks: Array<{ id: string; title: string }>;
  devices: InfraDevice[];
}

export async function getInfraTopology(): Promise<InfraTopology> {
  const res = await fetch(`${BASE}/api/infra-topology`);
  return res.json();
}

export async function getDashboard(view: string): Promise<unknown> {
  const res = await fetch(`${BASE}/api/dashboard?view=${encodeURIComponent(view)}`);
  return res.json();
}

export async function getStats(): Promise<DashboardStats> {
  const res = await fetch(`${BASE}/api/stats`);
  return res.json();
}

export async function* streamChat(
  message: string,
  history: Array<{ role: string; content: string }>,
): AsyncGenerator<{ text?: string; done?: boolean; matched_apps?: Array<{ id: string; title: string }>; error?: string }> {
  const res = await fetch(`${BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history: history.slice(-10) }),
  });

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      yield JSON.parse(line.slice(6));
    }
  }
}
