/**
 * Fix titles: extract object_title from stored raw_json
 */
import Database from 'better-sqlite3';
import { join } from 'node:path';

const db = new Database(join(import.meta.dirname!, '..', '..', 'data', 'impact.db'));

const rows = db.prepare(
  "SELECT id, raw_json FROM objects WHERE title = '(unknown)' AND raw_json != ''",
).all() as Array<{ id: string; raw_json: string }>;

console.log(rows.length + " objecten te fixen");

const update = db.prepare("UPDATE objects SET title = ? WHERE id = ?");
let fixed = 0;

for (const row of rows) {
  const obj = JSON.parse(row.raw_json) as { object_title?: string; title?: string };
  const realTitle = obj.object_title ?? obj.title;
  if (realTitle) {
    update.run(realTitle, row.id);
    fixed++;
  }
}

console.log(fixed + " titels hersteld");

// Quick check
const remaining = db.prepare("SELECT count(*) as n FROM objects WHERE title = '(unknown)'").get() as { n: number };
console.log("Nog onbekend: " + remaining.n);

db.close();
