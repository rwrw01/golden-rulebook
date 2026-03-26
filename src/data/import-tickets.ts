/**
 * Import TopDesk tickets from CSV file
 * Run: npx tsx src/data/import-tickets.ts <path-to-csv>
 *
 * Expected CSV format (first row = headers):
 * - Subject or Onderwerp column → ticket subject
 * - Description or Omschrijving column → ticket description
 * - Caller or Melder column → caller name
 * - Date or Datum column → date (ISO or DD-MM-YYYY)
 * - ID or Nummer column → TopDesk ticket ID
 *
 * Also accepts semicolon-delimited files (common for Dutch exports).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';

import { ensureEmbeddingTables } from './vector-repository.js';
import { processTicket } from '../service/cluster-service.js';

const DB_PATH = join(import.meta.dirname!, '..', '..', 'data', 'impact.db');

interface CsvRow {
  [key: string]: string;
}

function parseCsv(content: string): CsvRow[] {
  const lines = content.trim().split('\n').map(l => l.trim().replace(/\r$/, ''));
  if (lines.length < 2) return [];

  // Detect delimiter: semicolon or comma
  const headerLine = lines[0];
  const delimiter = headerLine.includes(';') ? ';' : ',';

  const headers = headerLine.split(delimiter).map(h => h.replace(/^"|"$/g, '').trim().toLowerCase());

  return lines.slice(1).map(line => {
    const values = line.split(delimiter).map(v => v.replace(/^"|"$/g, '').trim());
    const row: CsvRow = {};
    for (let i = 0; i < headers.length; i++) {
      row[headers[i]] = values[i] ?? '';
    }
    return row;
  });
}

function findColumn(row: CsvRow, ...candidates: string[]): string {
  for (const name of candidates) {
    if (row[name] !== undefined && row[name] !== '') return row[name];
  }
  return '';
}

function parseDate(dateStr: string): string | undefined {
  if (!dateStr) return undefined;
  // Try DD-MM-YYYY
  const match = dateStr.match(/^(\d{2})-(\d{2})-(\d{4})/);
  if (match) return `${match[3]}-${match[2]}-${match[1]}`;
  // Try ISO format
  if (dateStr.match(/^\d{4}-\d{2}-\d{2}/)) return dateStr;
  return undefined;
}

async function main(): Promise<void> {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error('Gebruik: npx tsx src/data/import-tickets.ts <pad-naar-csv>');
    process.exit(1);
  }

  console.log(`Importeren van: ${csvPath}`);
  const content = readFileSync(csvPath, 'utf-8');
  const rows = parseCsv(content);
  console.log(`${rows.length} rijen gevonden`);

  if (rows.length === 0) {
    console.error('Geen data gevonden in het bestand');
    process.exit(1);
  }

  // Show detected columns
  console.log('Gedetecteerde kolommen:', Object.keys(rows[0]).join(', '));

  const db = new Database(DB_PATH);
  ensureEmbeddingTables(db);

  let processed = 0;
  let alerts = 0;

  for (const row of rows) {
    const subject = findColumn(row, 'subject', 'onderwerp', 'titel', 'title', 'naam');
    if (!subject) continue;

    const description = findColumn(row, 'description', 'omschrijving', 'beschrijving', 'actie', 'details');
    const caller = findColumn(row, 'caller', 'melder', 'aanmelder', 'gebruiker', 'user');
    const topdeskId = findColumn(row, 'id', 'nummer', 'number', 'ticketnummer', 'incident_id');
    const dateStr = findColumn(row, 'date', 'datum', 'created', 'aangemaakt', 'creation_date');
    const receivedAt = parseDate(dateStr);

    try {
      const result = await processTicket(db, {
        topdeskId: topdeskId || undefined,
        subject,
        description: description || undefined,
        caller: caller || undefined,
        receivedAt,
      });

      processed++;
      if (result.patternAlert) alerts++;

      if (processed % 10 === 0) {
        console.log(`${processed}/${rows.length} verwerkt...`);
      }

      if (result.objectMatches.length > 0) {
        const topMatch = result.objectMatches[0];
        // Look up the object title
        const obj = db.prepare("SELECT title FROM objects WHERE id = ?").get(topMatch.objectId) as { title: string } | undefined;
        console.log(`  "${subject}" → ${obj?.title ?? topMatch.objectId} (${(topMatch.similarity * 100).toFixed(0)}%)`);
      }

      if (result.patternAlert) {
        console.log(`  ⚠ PATROON GEDETECTEERD: cluster ${result.clusterId} (≥3 tickets)`);
      }
    } catch (err) {
      console.error(`Fout bij verwerken van "${subject}": ${err}`);
    }
  }

  console.log(`\nKlaar! ${processed} tickets verwerkt, ${alerts} patroon-alerts`);
  db.close();
}

main().catch(console.error);
