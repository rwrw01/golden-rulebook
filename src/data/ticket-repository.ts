/**
 * Ticket repository — CRUD for tickets and clusters
 */
import Database from 'better-sqlite3';

export interface Ticket {
  id: number;
  topdeskId: string | null;
  subject: string;
  description: string | null;
  caller: string | null;
  receivedAt: string;
  processedAt: string | null;
  clusterId: number | null;
  status: string;
}

export interface TicketCluster {
  id: number;
  title: string;
  firstSeen: string;
  lastSeen: string;
  ticketCount: number;
  status: string;
  incidentId: number | null;
  confidence: number | null;
}

export function insertTicket(
  db: Database.Database,
  ticket: { topdeskId?: string; subject: string; description?: string; caller?: string; receivedAt?: string },
): number {
  const result = db.prepare(`
    INSERT INTO tickets (topdesk_id, subject, description, caller, received_at)
    VALUES (?, ?, ?, ?, COALESCE(?, datetime('now')))
  `).run(ticket.topdeskId ?? null, ticket.subject, ticket.description ?? null, ticket.caller ?? null, ticket.receivedAt ?? null);
  return Number(result.lastInsertRowid);
}

export function updateTicketCluster(db: Database.Database, ticketId: number, clusterId: number): void {
  db.prepare("UPDATE tickets SET cluster_id = ?, status = 'clustered' WHERE id = ?").run(clusterId, ticketId);
}

export function markTicketProcessed(db: Database.Database, ticketId: number): void {
  db.prepare("UPDATE tickets SET processed_at = datetime('now'), status = 'processing' WHERE id = ?").run(ticketId);
}

export function getRecentTickets(db: Database.Database, windowMinutes: number): Ticket[] {
  const rows = db.prepare(`
    SELECT id, topdesk_id, subject, description, caller, received_at, processed_at, cluster_id, status
    FROM tickets
    WHERE received_at >= datetime('now', '-' || ? || ' minutes')
    ORDER BY received_at DESC
  `).all(windowMinutes) as Array<Record<string, unknown>>;

  return rows.map(mapTicket);
}

export function createCluster(db: Database.Database, title: string, confidence: number): number {
  const now = new Date().toISOString();
  const result = db.prepare(`
    INSERT INTO ticket_clusters (title, first_seen, last_seen, ticket_count, confidence)
    VALUES (?, ?, ?, 1, ?)
  `).run(title, now, now, confidence);
  return Number(result.lastInsertRowid);
}

export function updateCluster(db: Database.Database, clusterId: number): void {
  db.prepare(`
    UPDATE ticket_clusters SET
      last_seen = datetime('now'),
      ticket_count = (SELECT count(*) FROM tickets WHERE cluster_id = ?)
    WHERE id = ?
  `).run(clusterId, clusterId);
}

export function getActiveClusters(db: Database.Database): TicketCluster[] {
  const rows = db.prepare(`
    SELECT id, title, first_seen, last_seen, ticket_count, status, incident_id, confidence
    FROM ticket_clusters
    WHERE status = 'active'
    ORDER BY last_seen DESC
  `).all() as Array<Record<string, unknown>>;

  return rows.map(r => ({
    id: r.id as number,
    title: r.title as string,
    firstSeen: r.first_seen as string,
    lastSeen: r.last_seen as string,
    ticketCount: r.ticket_count as number,
    status: r.status as string,
    incidentId: r.incident_id as number | null,
    confidence: r.confidence as number | null,
  }));
}

export function insertTicketObjectMatch(
  db: Database.Database,
  ticketId: number,
  objectId: string,
  similarity: number,
  matchMethod: string,
): void {
  db.prepare(`
    INSERT OR IGNORE INTO ticket_object_matches (ticket_id, object_id, similarity, match_method)
    VALUES (?, ?, ?, ?)
  `).run(ticketId, objectId, similarity, matchMethod);
}

function mapTicket(r: Record<string, unknown>): Ticket {
  return {
    id: r.id as number,
    topdeskId: r.topdesk_id as string | null,
    subject: r.subject as string,
    description: r.description as string | null,
    caller: r.caller as string | null,
    receivedAt: r.received_at as string,
    processedAt: r.processed_at as string | null,
    clusterId: r.cluster_id as number | null,
    status: r.status as string,
  };
}
