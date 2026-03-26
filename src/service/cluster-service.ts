/**
 * Cluster service — group tickets by root cause
 */
import Database from 'better-sqlite3';

import { findSimilarTickets, matchTicketToObjects, embedAndStoreTicket } from './similarity-service.js';
import {
  insertTicket, updateTicketCluster, markTicketProcessed,
  getRecentTickets, createCluster, updateCluster,
  insertTicketObjectMatch, getActiveClusters,
} from '../data/ticket-repository.js';
import { getEmbedding } from '../data/vector-repository.js';

// Configurable via env vars
const PATTERN_MIN_TICKETS = parseInt(process.env['PATTERN_MIN_TICKETS'] ?? '3', 10);
const PATTERN_WINDOW_MINUTES = parseInt(process.env['PATTERN_WINDOW_MINUTES'] ?? '60', 10);

export interface ProcessingResult {
  ticketId: number;
  objectMatches: Array<{ objectId: string; similarity: number; confidence: string }>;
  clusterId: number | null;
  isNewCluster: boolean;
  patternAlert: boolean;
}

/**
 * Process a single incoming ticket through the full pipeline:
 * 1. Store ticket
 * 2. Embed ticket text
 * 3. Match against BlueDolphin objects
 * 4. Find similar recent tickets
 * 5. Assign to cluster
 * 6. Check pattern threshold
 */
export async function processTicket(
  db: Database.Database,
  ticket: { topdeskId?: string; subject: string; description?: string; caller?: string; receivedAt?: string },
): Promise<ProcessingResult> {
  // Step 1: Store ticket
  const ticketId = insertTicket(db, ticket);
  markTicketProcessed(db, ticketId);

  // Step 2: Embed ticket
  await embedAndStoreTicket(db, ticketId, ticket.subject, ticket.description ?? null);

  // Step 3: Match against objects
  const ticketText = ticket.description ? `${ticket.subject}. ${ticket.description}` : ticket.subject;
  const objectMatches = await matchTicketToObjects(db, ticketText);

  // Store object matches
  for (const match of objectMatches) {
    insertTicketObjectMatch(db, ticketId, match.objectId, match.similarity, 'embedding');
  }

  // Step 4: Find similar recent tickets
  const similarTickets = await findSimilarTickets(db, ticketText, ticketId);

  // Step 5: Assign to cluster
  let clusterId: number | null = null;
  let isNewCluster = false;

  if (similarTickets.length > 0) {
    // Check if any similar ticket has a cluster
    const recentTickets = getRecentTickets(db, PATTERN_WINDOW_MINUTES * 4);
    const ticketMap = new Map(recentTickets.map(t => [String(t.id), t]));

    for (const match of similarTickets) {
      const existingTicket = ticketMap.get(match.ticketId);
      if (existingTicket?.clusterId) {
        clusterId = existingTicket.clusterId;
        break;
      }
    }

    if (!clusterId) {
      // Create new cluster from the best match pair
      clusterId = createCluster(db, ticket.subject, similarTickets[0].similarity);
      isNewCluster = true;

      // Add the similar ticket to the cluster too
      const similarTicketId = parseInt(similarTickets[0].ticketId, 10);
      updateTicketCluster(db, similarTicketId, clusterId);
    }

    updateTicketCluster(db, ticketId, clusterId);
    updateCluster(db, clusterId);
  }

  // Step 6: Check pattern threshold
  let patternAlert = false;
  if (clusterId) {
    const clusters = getActiveClusters(db);
    const thisCluster = clusters.find(c => c.id === clusterId);
    if (thisCluster && thisCluster.ticketCount >= PATTERN_MIN_TICKETS) {
      patternAlert = true;
    }
  }

  return {
    ticketId,
    objectMatches,
    clusterId,
    isNewCluster,
    patternAlert,
  };
}

/**
 * Check for active patterns across all clusters
 */
export function checkActivePatterns(db: Database.Database): Array<{
  cluster: { id: number; title: string; ticketCount: number };
  isAlert: boolean;
}> {
  const clusters = getActiveClusters(db);

  return clusters.map(c => ({
    cluster: { id: c.id, title: c.title, ticketCount: c.ticketCount },
    isAlert: c.ticketCount >= PATTERN_MIN_TICKETS,
  }));
}
