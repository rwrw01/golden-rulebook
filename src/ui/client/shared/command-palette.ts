/**
 * Command Palette — Ctrl+P search overlay
 */
import { h } from 'preact';
import { html } from 'htm/preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import { signal } from '@preact/signals';

import { searchObjects } from './api-client.js';
import { openTab, activeSidebar, sidebarVisible } from './state.js';
import { BdObject, TYPE_COLORS } from './types.js';

export const paletteOpen = signal(false);

export function togglePalette(): void {
  paletteOpen.value = !paletteOpen.value;
}

const COMMANDS = [
  { label: 'Portfolio openen', action: () => { activeSidebar.value = 'portfolio'; sidebarVisible.value = true; } },
  { label: 'Impact analyse', action: () => { activeSidebar.value = 'impact'; sidebarVisible.value = true; } },
  { label: 'Relaties verkennen', action: () => { activeSidebar.value = 'relations'; sidebarVisible.value = true; } },
  { label: 'Incidenten bekijken', action: () => { activeSidebar.value = 'incidents'; sidebarVisible.value = true; } },
  { label: 'Dashboard openen', action: () => { activeSidebar.value = 'dashboard'; sidebarVisible.value = true; } },
];

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<BdObject[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const isCommand = query.startsWith('>');

  useEffect(() => {
    if (paletteOpen.value) {
      setQuery('');
      setResults([]);
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [paletteOpen.value]);

  useEffect(() => {
    if (!isCommand && query.length >= 2) {
      searchObjects(query).then(r => {
        setResults(r);
        setSelectedIdx(0);
      });
    } else if (!isCommand) {
      setResults([]);
    }
  }, [query]);

  function handleKeyDown(e: KeyboardEvent): void {
    const itemCount = isCommand ? filteredCommands.length : results.length;

    if (e.key === 'Escape') {
      paletteOpen.value = false;
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx(prev => Math.min(prev + 1, itemCount - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (isCommand) {
        const cmd = filteredCommands[selectedIdx];
        if (cmd) { cmd.action(); paletteOpen.value = false; onClose(); }
      } else {
        const obj = results[selectedIdx];
        if (obj) { openTab(obj.id, obj.title, obj.type_name); paletteOpen.value = false; onClose(); }
      }
    }
  }

  const commandQuery = query.slice(1).toLowerCase();
  const filteredCommands = isCommand
    ? COMMANDS.filter(c => c.label.toLowerCase().includes(commandQuery))
    : [];

  if (!paletteOpen.value) return null;

  return html`
    <div class="palette-overlay" onClick=${() => { paletteOpen.value = false; onClose(); }}>
      <div class="palette-modal" onClick=${(e: Event) => e.stopPropagation()}>
        <input
          ref=${inputRef}
          class="palette-input"
          type="text"
          placeholder="Zoek object, of > voor commando's..."
          value=${query}
          onInput=${(e: Event) => setQuery((e.target as HTMLInputElement).value)}
          onKeyDown=${handleKeyDown}
        />

        <div class="palette-results">
          ${isCommand ? html`
            ${filteredCommands.map((cmd, i) => html`
              <div
                class="palette-item ${i === selectedIdx ? 'selected' : ''}"
                onClick=${() => { cmd.action(); paletteOpen.value = false; onClose(); }}
              >
                <span class="palette-cmd-icon">></span>
                <span>${cmd.label}</span>
              </div>
            `)}
          ` : html`
            ${results.map((obj, i) => html`
              <div
                class="palette-item ${i === selectedIdx ? 'selected' : ''}"
                onClick=${() => { openTab(obj.id, obj.title, obj.type_name); paletteOpen.value = false; onClose(); }}
              >
                <span class="tree-dot" style="background: ${TYPE_COLORS[obj.type_name] ?? '#666'}" />
                <span class="palette-title">${obj.title}</span>
                <span class="palette-type">${obj.type_name}</span>
              </div>
            `)}
            ${query.length >= 2 && results.length === 0 && html`
              <div class="palette-empty">Geen resultaten gevonden</div>
            `}
          `}
        </div>
      </div>
    </div>
  `;
}
