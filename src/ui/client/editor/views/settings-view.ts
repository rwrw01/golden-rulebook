/**
 * Settings view — embedding management, system info
 */
import { h } from 'preact';
import { html } from 'htm/preact';
import { useState, useEffect } from 'preact/hooks';

export function SettingsView() {
  const [embedStatus, setEmbedStatus] = useState<{ embedded: number; total: number; ready: boolean } | null>(null);
  const [rebuilding, setRebuilding] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchStatus();
  }, []);

  async function fetchStatus(): Promise<void> {
    const res = await fetch('/api/embed-status');
    setEmbedStatus(await res.json());
  }

  async function startRebuild(): Promise<void> {
    setRebuilding(true);
    setMessage('Embeddings worden opgebouwd... Dit kan enkele minuten duren.');
    await fetch('/api/embed-rebuild', { method: 'POST' });

    // Poll status every 5 seconds
    const interval = setInterval(async () => {
      const res = await fetch('/api/embed-status');
      const status = await res.json();
      setEmbedStatus(status);
      setMessage(`Bezig: ${status.embedded} / ${status.total} objecten geëmbed`);

      if (status.embedded >= status.total - 10) {
        clearInterval(interval);
        setRebuilding(false);
        setMessage(`Klaar! ${status.embedded} objecten geëmbed.`);
      }
    }, 5000);
  }

  return html`
    <div class="object-view" style="max-width: 600px">
      <h2 style="font-size:18px;margin-bottom:24px">Instellingen</h2>

      <div class="settings-section">
        <h3 style="font-size:14px;margin-bottom:12px">AI Embeddings (Nomic)</h3>
        <p class="sidebar-hint" style="margin-bottom:12px">
          Embeddings maken semantisch zoeken mogelijk. Zoek op "email" en vind Exchange, Outlook, Zivver —
          ook als het woord "email" niet in de naam staat.
        </p>

        ${embedStatus && html`
          <div class="settings-stats">
            <div class="settings-stat">
              <span class="settings-stat-value">${embedStatus.embedded}</span>
              <span class="settings-stat-label">Geëmbed</span>
            </div>
            <div class="settings-stat">
              <span class="settings-stat-value">${embedStatus.total}</span>
              <span class="settings-stat-label">Totaal objecten</span>
            </div>
            <div class="settings-stat">
              <span class="settings-stat-value ${embedStatus.ready ? 'ready' : 'not-ready'}">${embedStatus.ready ? 'Actief' : 'Inactief'}</span>
              <span class="settings-stat-label">Status</span>
            </div>
          </div>
        `}

        ${message && html`<div class="settings-message">${message}</div>`}

        <button
          class="sidebar-action-btn"
          style="margin-top:12px;width:auto;display:inline-block"
          onClick=${startRebuild}
          disabled=${rebuilding}
        >
          ${rebuilding ? 'Bezig met embedden...' : embedStatus?.embedded === 0 ? 'Embeddings aanmaken' : 'Opnieuw embedden (nieuwe objecten)'}
        </button>

        <p class="sidebar-hint" style="margin-top:8px">
          ${embedStatus?.embedded === 0
            ? 'Nog geen embeddings aangemaakt. Klik de knop om te starten (~2-5 min).'
            : `${embedStatus?.total ? embedStatus.total - embedStatus.embedded : '?'} objecten nog niet geëmbed. Klik om bij te werken.`
          }
        </p>
      </div>

      <div class="settings-section" style="margin-top:32px">
        <h3 style="font-size:14px;margin-bottom:12px">Over</h3>
        <table class="properties-table">
          <tbody>
            <tr><td class="prop-key">Applicatie</td><td class="prop-value">BlueDolphin Inzicht</td></tr>
            <tr><td class="prop-key">Embedding model</td><td class="prop-value">nomic-ai/nomic-embed-text-v1.5</td></tr>
            <tr><td class="prop-key">AI Chat</td><td class="prop-value">Claude (Anthropic)</td></tr>
            <tr><td class="prop-key">Graph engine</td><td class="prop-value">Cytoscape.js + D3.js</td></tr>
            <tr><td class="prop-key">Licentie</td><td class="prop-value">EUPL-1.2</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
}
