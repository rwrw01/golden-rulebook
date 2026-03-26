/**
 * Similarity service — match tickets to objects and find similar tickets
 */
import Database from 'better-sqlite3';

import { embedText, cosineSimilarity, findTopK } from './embedding-service.js';
import { getAllEmbeddings, getEmbedding, upsertEmbedding } from '../data/vector-repository.js';

// Configurable thresholds (via env vars)
const OBJECT_MATCH_MIN = parseFloat(process.env['TICKET_OBJECT_MATCH_MIN'] ?? '0.65');
const OBJECT_MATCH_HIGH = parseFloat(process.env['TICKET_OBJECT_MATCH_HIGH'] ?? '0.80');
const CLUSTER_THRESHOLD = parseFloat(process.env['TICKET_CLUSTER_THRESHOLD'] ?? '0.75');

export interface ObjectMatch {
  objectId: string;
  similarity: number;
  confidence: 'high' | 'medium';
}

export interface TicketMatch {
  ticketId: string;
  similarity: number;
}

/**
 * Match a ticket text against all BlueDolphin object embeddings
 */
export async function matchTicketToObjects(
  db: Database.Database,
  ticketText: string,
): Promise<ObjectMatch[]> {
  const queryVector = await embedText(ticketText, true);
  const objectEmbeddings = getAllEmbeddings(db, 'object');

  const candidates = objectEmbeddings.map(e => ({
    id: e.sourceId,
    vector: e.vector,
  }));

  const topMatches = findTopK(queryVector, candidates, 20, OBJECT_MATCH_MIN);

  return topMatches.map(m => ({
    objectId: m.id,
    similarity: m.similarity,
    confidence: m.similarity >= OBJECT_MATCH_HIGH ? 'high' : 'medium',
  }));
}

/**
 * Find similar tickets in the recent window
 */
export async function findSimilarTickets(
  db: Database.Database,
  ticketText: string,
  excludeTicketId?: number,
): Promise<TicketMatch[]> {
  const queryVector = await embedText(ticketText, true);
  const ticketEmbeddings = getAllEmbeddings(db, 'ticket');

  const candidates = ticketEmbeddings
    .filter(e => !excludeTicketId || e.sourceId !== String(excludeTicketId))
    .map(e => ({ id: e.sourceId, vector: e.vector }));

  const matches = findTopK(queryVector, candidates, 10, CLUSTER_THRESHOLD);

  return matches.map(m => ({
    ticketId: m.id,
    similarity: m.similarity,
  }));
}

/**
 * Embed and store a ticket
 */
export async function embedAndStoreTicket(
  db: Database.Database,
  ticketId: number,
  subject: string,
  description: string | null,
): Promise<void> {
  const text = description ? `${subject}. ${description}` : subject;
  const vector = await embedText(text, false);

  upsertEmbedding(db, {
    sourceType: 'ticket',
    sourceId: String(ticketId),
    textInput: text,
    vector,
  });
}

/**
 * Embed and store a BlueDolphin object
 */
export async function embedAndStoreObject(
  db: Database.Database,
  objectId: string,
  typeName: string,
  title: string,
  aliases?: string[],
): Promise<void> {
  let text = `${typeName}: ${title}`;
  if (aliases && aliases.length > 0) {
    text += `. Ook bekend als: ${aliases.join(', ')}`;
  }
  const vector = await embedText(text, false);

  upsertEmbedding(db, {
    sourceType: 'object',
    sourceId: objectId,
    textInput: text,
    vector,
  });
}

export { OBJECT_MATCH_MIN, OBJECT_MATCH_HIGH, CLUSTER_THRESHOLD };
