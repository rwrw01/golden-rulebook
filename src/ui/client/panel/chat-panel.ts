/**
 * AI Chat panel — streaming chat with Claude
 */
import { h } from 'preact';
import { html } from 'htm/preact';
import { useState, useRef, useEffect } from 'preact/hooks';

import { chatHistory, chatStreaming, activeTab } from '../shared/state.js';
import { streamChat } from '../shared/api-client.js';
import { navigateToObject } from '../shared/state.js';

function markdownToHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .split('\n')
    .map(line => {
      const trimmed = line.trim();
      if (trimmed.startsWith('- ')) return `<li>${trimmed.slice(2)}</li>`;
      if (trimmed === '---') return '<hr>';
      if (trimmed === '') return '';
      return `<p>${trimmed}</p>`;
    })
    .join('\n');
}

export function ChatPanel() {
  const [input, setInput] = useState('');
  const [streamContent, setStreamContent] = useState('');
  const [matchedApps, setMatchedApps] = useState<Array<{ id: string; title: string }>>([]);
  const [lastMeta, setLastMeta] = useState<{ provider: string; duration: string; intents: string[] } | null>(null);
  const messagesRef = useRef<HTMLDivElement>(null);

  function scrollToBottom(): void {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }

  useEffect(scrollToBottom, [chatHistory.value.length, streamContent]);

  async function sendMessage(): Promise<void> {
    const text = input.trim();
    if (!text || chatStreaming.value) return;

    setInput('');
    chatStreaming.value = true;
    chatHistory.value = [...chatHistory.value, { role: 'user', content: text }];

    let content = '';
    setStreamContent('');
    setMatchedApps([]);

    try {
      for await (const chunk of streamChat(text, chatHistory.value)) {
        if (chunk.text) {
          content += chunk.text;
          setStreamContent(content);
        }
        if (chunk.done) {
          if (chunk.matched_apps) setMatchedApps(chunk.matched_apps);
          if (chunk.provider) setLastMeta({ provider: chunk.provider, duration: chunk.duration ?? '?', intents: chunk.intents ?? [] });
        }
        if (chunk.error) {
          content = `Fout: ${chunk.error}`;
          setStreamContent(content);
        }
      }
    } catch (err) {
      content = `Verbindingsfout: ${(err as Error).message}`;
      setStreamContent(content);
    }

    chatHistory.value = [...chatHistory.value, { role: 'assistant', content }];
    setStreamContent('');
    chatStreaming.value = false;
  }

  function handleKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  const history = chatHistory.value;

  return html`
    <div class="chat-panel">
      <div class="chat-messages" ref=${messagesRef}>
        ${history.length === 0 && html`
          <div class="chat-msg assistant">
            <p>Welkom bij de Impact Analyse chat. Beschrijf een incident of stel een vraag over de architectuur.</p>
          </div>
        `}

        ${history.map((msg, i) => html`
          <div class="chat-msg ${msg.role}">
            ${msg.role === 'user'
              ? html`<p>${msg.content}</p>`
              : html`<div dangerouslySetInnerHTML=${{ __html: markdownToHtml(msg.content) }} />`
            }
          </div>
        `)}

        ${chatStreaming.value && html`
          <div class="chat-msg assistant">
            ${streamContent
              ? html`<div dangerouslySetInnerHTML=${{ __html: markdownToHtml(streamContent) }} />`
              : html`<div class="typing-indicator"><span /><span /><span /></div>`
            }
          </div>
        `}

        ${matchedApps.length > 0 && html`
          <div class="chat-matched">
            ${matchedApps.map(app => html`
              <a class="impact-tag clickable" onClick=${() => navigateToObject(app.id, app.title, 'Applicatie')}>
                ${app.title}
              </a>
            `)}
          </div>
        `}

        ${lastMeta && html`
          <div style="padding: 4px 12px; font-size: 11px; color: #888; display: flex; gap: 8px; align-items: center;">
            <span style="background: ${lastMeta.provider.startsWith('Claude') ? '#d4a574' : '#74b9d4'}; color: #1e1e2e; padding: 1px 6px; border-radius: 3px; font-weight: 600;">
              ${lastMeta.provider}
            </span>
            <span>${lastMeta.duration}s</span>
            <span>${lastMeta.intents.join(' + ')}</span>
          </div>
        `}
      </div>

      <div class="chat-input-row">
        <input
          class="chat-input"
          type="text"
          placeholder="Beschrijf het incident..."
          value=${input}
          onInput=${(e: Event) => setInput((e.target as HTMLInputElement).value)}
          onKeyDown=${handleKeyDown}
          disabled=${chatStreaming.value}
        />
        <button class="chat-send" onClick=${sendMessage} disabled=${chatStreaming.value || !input.trim()}>
          Verstuur
        </button>
      </div>
    </div>
  `;
}
