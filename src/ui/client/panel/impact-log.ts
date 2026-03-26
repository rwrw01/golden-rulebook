/**
 * Impact Log panel — shows cascade steps from impact analyses
 */
import { h } from 'preact';
import { html } from 'htm/preact';
import { signal } from '@preact/signals';

export interface LogEntry {
  timestamp: string;
  appTitle: string;
  processes: number;
  functions: number;
  actors: number;
}

export const impactLogs = signal<LogEntry[]>([]);

export function addImpactLog(appTitle: string, processes: number, functions: number, actors: number): void {
  const entry: LogEntry = {
    timestamp: new Date().toLocaleTimeString('nl-NL'),
    appTitle,
    processes,
    functions,
    actors,
  };
  impactLogs.value = [entry, ...impactLogs.value].slice(0, 50);
}

export function ImpactLogPanel() {
  const logs = impactLogs.value;

  if (logs.length === 0) {
    return html`<div class="panel-empty">Voer een impact analyse uit om het log te vullen.</div>`;
  }

  return html`
    <div class="impact-log-panel">
      <table class="log-table">
        <thead>
          <tr>
            <th>Tijd</th>
            <th>Applicatie</th>
            <th>Processen</th>
            <th>Functies</th>
            <th>Actoren</th>
          </tr>
        </thead>
        <tbody>
          ${logs.map(log => html`
            <tr>
              <td>${log.timestamp}</td>
              <td>${log.appTitle}</td>
              <td>${log.processes}</td>
              <td>${log.functions}</td>
              <td>${log.actors}</td>
            </tr>
          `)}
        </tbody>
      </table>
    </div>
  `;
}
