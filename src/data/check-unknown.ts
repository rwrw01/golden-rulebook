import Database from 'better-sqlite3';
import { join } from 'node:path';

const db = new Database(join(import.meta.dirname!, '..', '..', 'data', 'impact.db'), { readonly: true });

const row = db.prepare("SELECT raw_json FROM objects WHERE title = '(unknown)' AND raw_json != '' LIMIT 1").get() as { raw_json: string };
const obj = JSON.parse(row.raw_json) as Record<string, unknown>;
// Show top-level keys
console.log("Top keys: " + Object.keys(obj).join(", "));
// Find title-like fields
for (const k of Object.keys(obj)) {
  if (typeof obj[k] === 'string' && (obj[k] as string).length > 0 && (obj[k] as string).length < 200) {
    console.log("  " + k + ": " + String(obj[k]).slice(0, 100));
  }
}

db.close();
