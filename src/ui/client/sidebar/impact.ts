/**
 * Impact sidebar — quick impact analysis
 */
import { h } from 'preact';
import { html } from 'htm/preact';
import { useState } from 'preact/hooks';

import { impactQuery, openTab, activePanelTab } from '../shared/state.js';
import { getImpact } from '../shared/api-client.js';
import { ImpactResult, BdObject, TYPE_COLORS } from '../shared/types.js';

interface SearchResult extends BdObject {
  score: number;
  method: string;
}

interface RecentAnalysis {
  appId: string;
  appTitle: string;
  result: ImpactResult;
}

export function ImpactSidebar() {
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [recentAnalyses, setRecentAnalyses] = useState<RecentAnalysis[]>([]);
  const [currentImpact, setCurrentImpact] = useState<ImpactResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchMethod, setSearchMethod] = useState<string>('');

  async function handleSearch(query: string): Promise<void> {
    impactQuery.value = query;
    if (query.length < 2) { setSearchResults([]); return; }

    // Use semantic search endpoint (keyword + embeddings)
    const res = await fetch(`/api/semantic-search?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    const results = (data.results ?? []) as SearchResult[];
    // Show all types, apps first, then others
    const sorted = results.sort((a: SearchResult, b: SearchResult) => {
      if (a.type_name === 'Applicatie' && b.type_name !== 'Applicatie') return -1;
      if (b.type_name === 'Applicatie' && a.type_name !== 'Applicatie') return 1;
      return (b.score ?? 0) - (a.score ?? 0);
    });
    setSearchResults(sorted.slice(0, 15));
    setSearchMethod(data.embeddingsAvailable ? 'AI + keyword' : 'keyword');
  }

  async function analyzeApp(app: BdObject): Promise<void> {
    setLoading(true);
    setSearchResults([]);
    impactQuery.value = app.title;

    const result = await getImpact(app.id);
    if (result) {
      setCurrentImpact(result);
      setRecentAnalyses(prev => {
        const filtered = prev.filter(r => r.appId !== app.id);
        return [{ appId: app.id, appTitle: app.title, result }, ...filtered].slice(0, 5);
      });
    }
    setLoading(false);
  }

  function severityColor(count: number): string {
    if (count > 20) return '#ef4444';
    if (count > 10) return '#f59e0b';
    if (count > 5) return '#eab308';
    return '#22c55e';
  }

  return html`
    <div class="impact-sidebar">
      <input
        class="sidebar-search"
        type="text"
        placeholder="Welk systeem heeft een storing?"
        value=${impactQuery.value}
        onInput=${(e: Event) => handleSearch((e.target as HTMLInputElement).value)}
      />

      ${searchResults.length > 0 && html`
        <div class="search-results">
          ${searchMethod && html`<div class="search-method">Zoeken via ${searchMethod}</div>`}
          ${searchResults.map(r => html`
            <div class="search-result" onClick=${() => analyzeApp(r)}>
              <span>
                <span class="tree-dot" style="background: ${TYPE_COLORS[r.type_name] ?? '#666'}; margin-right: 6px" />
                ${r.title}
              </span>
              <span style="display:flex;gap:4px;align-items:center">
                ${r.method === 'semantic' && html`<span class="semantic-badge">${Math.round((r.score ?? 0) * 100)}%</span>`}
                <span style="font-size:10px;color:var(--dim)">${r.type_name}</span>
              </span>
            </div>
          `)}
        </div>
      `}

      ${loading && html`<div class="sidebar-loading">Analyseren...</div>`}

      ${currentImpact && !loading && html`
        <div class="impact-preview">
          <div class="impact-mini app">
            <span class="impact-label">Applicatie</span>
            <span class="impact-value">${currentImpact.app.title}</span>
          </div>
          <div class="impact-mini location">
            <span class="impact-label">Locaties</span>
            <span class="impact-value">${currentImpact.locations.length}</span>
          </div>
          <div class="impact-mini process">
            <span class="impact-label">Processen</span>
            <span class="impact-value" style="color: ${severityColor(currentImpact.processes.length)}">${currentImpact.processes.length}</span>
          </div>
          <div class="impact-mini actor">
            <span class="impact-label">Actoren</span>
            <span class="impact-value" style="color: ${severityColor(currentImpact.actors.length)}">${currentImpact.actors.length}</span>
          </div>

          <button class="impact-open-btn" onClick=${() => openTab(currentImpact!.app.id, currentImpact!.app.title, 'Applicatie')}>
            Bekijk details →
          </button>
        </div>
      `}

      ${recentAnalyses.length > 0 && html`
        <div class="recent-section">
          <div class="section-label">Recente analyses</div>
          ${recentAnalyses.map(r => html`
            <div class="recent-item" onClick=${() => { setCurrentImpact(r.result); impactQuery.value = r.appTitle; }}>
              <span>${r.appTitle}</span>
              <span class="recent-count">${r.result.processes.length} proc.</span>
            </div>
          `)}
        </div>
      `}
    </div>
  `;
}
