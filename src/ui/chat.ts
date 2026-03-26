/**
 * Chat endpoint: incident coordinator asks a question,
 * we search local DB + embeddings, classify intent, build context, stream LLM response
 */
import type { ServerResponse } from 'node:http';
import type Database from 'better-sqlite3';

import { classifyQuery } from '../service/query-classifier.js';
import { prioritizeMerge, buildIntentContext } from '../service/context-builder.js';
import type { SearchHit } from '../service/types.js';

const LLM_PROVIDER = process.env['LLM_PROVIDER'] ?? 'ollama'; // 'ollama' or 'anthropic'
const OLLAMA_BASE = process.env['OLLAMA_URL'] ?? 'http://localhost:11434';
const OLLAMA_MODEL = process.env['OLLAMA_MODEL'] ?? 'gemma3:4b';
const ANTHROPIC_KEY = process.env['ANTHROPIC_API_KEY'] ?? '';
const ANTHROPIC_MODEL = process.env['ANTHROPIC_MODEL'] ?? 'claude-sonnet-4-6';

function searchLocalDb(db: Database.Database, query: string): {
  apps: SearchHit[];
  processes: SearchHit[];
  actors: SearchHit[];
  allHits: SearchHit[];
} {
  const words = query.toLowerCase()
    .replace(/[^a-z0-9\s\-]/g, '')
    .split(/\s+/)
    .filter(w => w.length >= 2 && !['een', 'het', 'van', 'met', 'bij', 'heb', 'ik', 'in', 'de', 'is', 'er', 'dat', 'die'].includes(w));

  if (words.length === 0) return { apps: [], processes: [], actors: [], allHits: [] };

  const allHits: SearchHit[] = [];
  const seen = new Set<string>();

  for (const word of words) {
    const rows = db.prepare(
      "SELECT o.id, o.title, ot.name as type FROM objects o JOIN object_types ot ON o.type_id = ot.template_id WHERE o.is_template = 0 AND o.title LIKE ? ORDER BY ot.name LIMIT 30",
    ).all('%' + word + '%') as Array<{ id: string; title: string; type: string }>;

    for (const row of rows) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      const titleLower = row.title.toLowerCase();
      let score = 1;
      if (titleLower === word) score = 10;
      else if (titleLower.startsWith(word)) score = 5;
      else if (titleLower.includes(' ' + word)) score = 3;
      allHits.push({ ...row, score });
    }
  }

  allHits.sort((a, b) => b.score - a.score);

  return {
    apps: allHits.filter(h => h.type === 'Applicatie').slice(0, 10),
    processes: allHits.filter(h => h.type === 'Bedrijfsproces').slice(0, 10),
    actors: allHits.filter(h => h.type === 'Actor').slice(0, 10),
    allHits: allHits.slice(0, 20),
  };
}

export async function handleChat(
  body: string,
  db: Database.Database,
  res: ServerResponse,
): Promise<void> {
  const parsed = JSON.parse(body) as { message: string; history?: Array<{ role: string; content: string }> };
  const userMessage = parsed.message;
  const history = parsed.history ?? [];

  // Classify the question: detect intents + system names
  const classification = classifyQuery(userMessage);

  // Search local DB (keyword)
  const localResults = searchLocalDb(db, userMessage);

  // Semantic search + re-ranking via Ollama embeddings
  let semanticHits: SearchHit[] = [];
  try {
    const { embedText, findTopK, rerank } = await import('../service/embedding-service.js');
    const { getAllEmbeddings } = await import('../data/vector-repository.js');
    const count = (db.prepare("SELECT count(*) as n FROM embeddings WHERE source_type = 'object'").get() as { n: number }).n;
    if (count > 0) {
      const queryVector = await embedText(userMessage, true);
      const objectEmbeddings = getAllEmbeddings(db, 'object');
      const matches = findTopK(queryVector, objectEmbeddings.map(e => ({ id: e.sourceId, vector: e.vector })), 20, 0.40);

      const candidates = matches.map(m => {
        const obj = db.prepare("SELECT o.id, o.title, ot.name as type_name FROM objects o JOIN object_types ot ON o.type_id = ot.template_id WHERE o.id = ?").get(m.id) as { id: string; title: string; type_name: string } | undefined;
        return obj ? { id: obj.id, title: obj.title, type: obj.type_name } : null;
      }).filter(Boolean) as Array<{ id: string; title: string; type: string }>;

      const reranked = await rerank(userMessage, candidates, 10);
      semanticHits = reranked.map(r => ({ id: r.id, title: r.title, type: r.type, score: r.score }));
    }
  } catch (err) {
    console.error('Semantic search error:', err instanceof Error ? err.message : err);
  }

  // Smart merge: system name keyword matches first, then semantic, then remaining
  const allHits = prioritizeMerge(localResults.allHits, semanticHits, classification.systemNames, 10);

  // Build intent-filtered context (only relevant relation types)
  const contextChunks = buildIntentContext(db, allHits, classification.intents);

  console.log(`[chat] "${userMessage.substring(0, 60)}" | intents=${classification.intents.join('+')} | systems=${classification.systemNames.join(',')} | hits=${allHits.length} | context=${contextChunks.length}chars | provider=${LLM_PROVIDER}`);

  // Build system prompt with enriched context
  const systemPrompt = `Je bent ICT-incidentcoördinator assistent voor gemeente Leiden.

# BRONDATA UIT BLUEDOLPHIN (DIT IS JE ENIGE BRON)
${contextChunks}

# REGELS (STRIKT)
1. Gebruik UITSLUITEND de bovenstaande brondata. VERZIN NIETS. Geen systemen, processen, personen of locaties die niet hierboven staan.
2. Als de brondata leeg is of geen relevante matches bevat: zeg "Ik heb geen informatie over dit onderwerp in de BlueDolphin database gevonden."
3. Verwijs naar objecten met [naam](/app/id) links.
4. Begin met een storingsmelding (B1-taalniveau, kort, zakelijk) als de vraag over een storing gaat.
5. Noem daarna: getroffen processen, te informeren teams, gerelateerde infrastructuur — ALLEEN als die in de brondata staan.
7. Gebruik het woord "teams" in plaats van "actoren" in je antwoord.
6. Max 15 regels. Nederlands. Markdown.

# Stijlregels (strikt)
- ALTIJD beginnen met een kant-en-klare storingsmelding voor eindgebruikers in een apart blok. Dit is het BELANGRIJKSTE onderdeel.
- Storingsmelding: B1-taalniveau, zakelijk, neutraal. Korte zinnen, geen jargon, actieve werkwoorden, max 1 bijzin per zin. Geen emoji. Begin met "Storingsmelding:" als kop.
- Daarna kort: getroffen processen, te informeren personen, acties.
- Max 15 regels totaal (exclusief storingsmelding).
- Links naar apps: [naam](/app/{id})
- Nederlands. Markdown: **vet** voor namen, lijsten voor acties.`;

  // Build messages for Ollama
  const messages: Array<{ role: string; content: string }> = [
    { role: 'system', content: systemPrompt },
  ];
  for (const msg of history.slice(-10)) {
    messages.push({ role: msg.role, content: msg.content });
  }
  messages.push({ role: 'user', content: userMessage });

  // Stream response
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });
  res.flushHeaders();

  const streamStart = Date.now();
  try {
    if (LLM_PROVIDER === 'anthropic') {
      await streamAnthropic(messages, res);
    } else {
      await streamOllama(messages, res);
    }
    console.log(`[chat] streamed in ${((Date.now() - streamStart) / 1000).toFixed(1)}s`);

    // Send completion event with metadata for UI
    const durationSec = ((Date.now() - streamStart) / 1000).toFixed(1);
    res.write('data: ' + JSON.stringify({
      done: true,
      provider: LLM_PROVIDER === 'anthropic' ? `Claude (${ANTHROPIC_MODEL})` : `Ollama (${OLLAMA_MODEL})`,
      duration: durationSec,
      intents: classification.intents,
      matched_apps: allHits
        .filter(h => h.type === 'Applicatie')
        .slice(0, 5)
        .map(a => ({ id: a.id, title: a.title })),
    }) + '\n\n');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (LLM_PROVIDER === 'anthropic') {
      res.write('data: ' + JSON.stringify({ text: `Anthropic API fout: ${msg}\n\nControleer ANTHROPIC_API_KEY env var.` }) + '\n\n');
    } else if (msg.includes('ECONNREFUSED')) {
      res.write('data: ' + JSON.stringify({ text: `Kan geen verbinding maken met Ollama op ${OLLAMA_BASE}.\n\nStart Ollama met:\n\`\`\`\nollama serve\n\`\`\`\n\nControleer ook of het model beschikbaar is:\n\`\`\`\nollama pull ${OLLAMA_MODEL}\n\`\`\`` }) + '\n\n');
    } else {
      res.write('data: ' + JSON.stringify({ error: msg }) + '\n\n');
    }
  }

  res.end();
}

async function streamOllama(messages: Array<{ role: string; content: string }>, res: ServerResponse): Promise<void> {
  const ollamaRes = await fetch(`${OLLAMA_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages,
      stream: true,
      options: { temperature: 0.1 },
    }),
  });

  if (!ollamaRes.ok) {
    const errText = await ollamaRes.text();
    res.write('data: ' + JSON.stringify({ text: `Ollama fout (${ollamaRes.status}): ${errText}` }) + '\n\n');
    return;
  }

  const reader = ollamaRes.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const chunk = JSON.parse(line) as { message?: { content: string }; done?: boolean };
        if (chunk.message?.content) {
          res.write('data: ' + JSON.stringify({ text: chunk.message.content }) + '\n\n');
        }
      } catch { /* skip */ }
    }
  }
}

async function streamAnthropic(messages: Array<{ role: string; content: string }>, res: ServerResponse): Promise<void> {
  if (!ANTHROPIC_KEY) {
    res.write('data: ' + JSON.stringify({ text: 'ANTHROPIC_API_KEY niet geconfigureerd.\n\nStart met:\n```\nANTHROPIC_API_KEY=sk-ant-... npm run dev\n```' }) + '\n\n');
    return;
  }

  // Anthropic expects system separate from messages, and no 'system' role in messages
  const systemMsg = messages.find(m => m.role === 'system')?.content ?? '';
  const chatMessages = messages
    .filter(m => m.role !== 'system')
    .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

  const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 1024,
      system: systemMsg,
      messages: chatMessages,
      stream: true,
    }),
  });

  if (!apiRes.ok) {
    const errText = await apiRes.text();
    res.write('data: ' + JSON.stringify({ text: `Anthropic API fout (${apiRes.status}): ${errText}` }) + '\n\n');
    return;
  }

  const reader = apiRes.body!.getReader();
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
      const payload = line.slice(6).trim();
      if (!payload) continue;
      try {
        const evt = JSON.parse(payload) as { type: string; delta?: { text?: string } };
        if (evt.type === 'content_block_delta' && evt.delta?.text) {
          res.write('data: ' + JSON.stringify({ text: evt.delta.text }) + '\n\n');
        }
        if (evt.type === 'message_stop') return;
      } catch { /* skip malformed JSON */ }
    }
  }
}
