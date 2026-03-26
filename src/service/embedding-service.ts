/**
 * Embedding service — uses Ollama nomic-embed-text for embeddings
 * Single system: Ollama handles both chat (Gemma) and embeddings (Nomic)
 */

const OLLAMA_BASE = process.env['OLLAMA_URL'] ?? 'http://localhost:11434';
const EMBED_MODEL = process.env['OLLAMA_EMBED_MODEL'] ?? 'nomic-embed-text';

/**
 * Embed a single text via Ollama
 */
export async function embedText(text: string, isQuery = false): Promise<Float32Array> {
  const prefix = isQuery ? 'search_query: ' : 'search_document: ';
  const response = await fetch(`${OLLAMA_BASE}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL, input: prefix + text }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Ollama embed failed (${response.status}): ${err}`);
  }

  const data = await response.json() as { embeddings: number[][] };
  return new Float32Array(data.embeddings[0]);
}

/**
 * Embed multiple texts (batch) via Ollama
 */
export async function embedBatch(texts: string[], isQuery = false): Promise<Float32Array[]> {
  const prefix = isQuery ? 'search_query: ' : 'search_document: ';
  const prefixed = texts.map(t => prefix + t);

  const response = await fetch(`${OLLAMA_BASE}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL, input: prefixed }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Ollama embed batch failed (${response.status}): ${err}`);
  }

  const data = await response.json() as { embeddings: number[][] };
  return data.embeddings.map(e => new Float32Array(e));
}

/**
 * Cosine similarity between two vectors (both assumed normalized)
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Find top-K most similar vectors from a collection
 */
export function findTopK(
  query: Float32Array,
  candidates: Array<{ id: string; vector: Float32Array }>,
  k: number,
  minSimilarity = 0,
): Array<{ id: string; similarity: number }> {
  const scored = candidates.map(c => ({
    id: c.id,
    similarity: cosineSimilarity(query, c.vector),
  }));

  return scored
    .filter(s => s.similarity >= minSimilarity)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, k);
}

/**
 * Re-rank: score each candidate by embedding the query+candidate together
 * and comparing to the query-only embedding
 */
export async function rerank(
  query: string,
  candidates: Array<{ id: string; title: string; type: string }>,
  topK: number,
): Promise<Array<{ id: string; title: string; type: string; score: number }>> {
  // Embed query
  const queryVec = await embedText(query, true);

  // Embed each candidate with context
  const candidateTexts = candidates.map(c => `${c.type}: ${c.title}`);
  const candidateVecs = await embedBatch(candidateTexts, false);

  const scored = candidates.map((c, i) => ({
    ...c,
    score: cosineSimilarity(queryVec, candidateVecs[i]),
  }));

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
