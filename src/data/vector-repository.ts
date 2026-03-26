/**
 * Vector repository — store and query embeddings in SQLite as BLOBs
 */
import Database from 'better-sqlite3';

export interface EmbeddingRecord {
  sourceType: string;
  sourceId: string;
  textInput: string;
  vector: Float32Array;
}

export function ensureEmbeddingTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS embeddings (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      source_type TEXT NOT NULL,
      source_id   TEXT NOT NULL,
      text_input  TEXT NOT NULL,
      vector      BLOB NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(source_type, source_id)
    );
    CREATE INDEX IF NOT EXISTS idx_embeddings_source ON embeddings(source_type, source_id);

    CREATE TABLE IF NOT EXISTS tickets (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      topdesk_id  TEXT UNIQUE,
      subject     TEXT NOT NULL,
      description TEXT,
      caller      TEXT,
      received_at TEXT NOT NULL DEFAULT (datetime('now')),
      processed_at TEXT,
      cluster_id  INTEGER REFERENCES ticket_clusters(id),
      status      TEXT DEFAULT 'new'
    );
    CREATE INDEX IF NOT EXISTS idx_tickets_received ON tickets(received_at);

    CREATE TABLE IF NOT EXISTS ticket_clusters (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      title         TEXT NOT NULL,
      first_seen    TEXT NOT NULL,
      last_seen     TEXT NOT NULL,
      ticket_count  INTEGER DEFAULT 1,
      status        TEXT DEFAULT 'active',
      incident_id   INTEGER,
      confidence    REAL
    );

    CREATE TABLE IF NOT EXISTS ticket_object_matches (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id   INTEGER NOT NULL REFERENCES tickets(id),
      object_id   TEXT NOT NULL,
      similarity  REAL NOT NULL,
      match_method TEXT NOT NULL,
      UNIQUE(ticket_id, object_id)
    );
  `);
}

export function upsertEmbedding(db: Database.Database, record: EmbeddingRecord): void {
  const buffer = Buffer.from(record.vector.buffer);
  db.prepare(`
    INSERT INTO embeddings (source_type, source_id, text_input, vector)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(source_type, source_id) DO UPDATE SET
      text_input = excluded.text_input,
      vector = excluded.vector,
      created_at = datetime('now')
  `).run(record.sourceType, record.sourceId, record.textInput, buffer);
}

export function getEmbedding(db: Database.Database, sourceType: string, sourceId: string): Float32Array | null {
  const row = db.prepare(
    "SELECT vector FROM embeddings WHERE source_type = ? AND source_id = ?",
  ).get(sourceType, sourceId) as { vector: Buffer } | undefined;
  if (!row) return null;
  return new Float32Array(row.vector.buffer, row.vector.byteOffset, row.vector.byteLength / 4);
}

export function getAllEmbeddings(db: Database.Database, sourceType: string): Array<{ sourceId: string; vector: Float32Array }> {
  const rows = db.prepare(
    "SELECT source_id, vector FROM embeddings WHERE source_type = ?",
  ).all(sourceType) as Array<{ source_id: string; vector: Buffer }>;

  return rows.map(row => ({
    sourceId: row.source_id,
    vector: new Float32Array(row.vector.buffer, row.vector.byteOffset, row.vector.byteLength / 4),
  }));
}

export function getEmbeddingCount(db: Database.Database, sourceType: string): number {
  const row = db.prepare(
    "SELECT count(*) as n FROM embeddings WHERE source_type = ?",
  ).get(sourceType) as { n: number };
  return row.n;
}
