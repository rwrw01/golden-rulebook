import Database from 'better-sqlite3';
import { join } from 'node:path';

const db = new Database(join(import.meta.dirname!, '..', '..', 'data', 'impact.db'), { readonly: true });

const types = db.prepare(
  "SELECT ot.name, count(*) as n FROM objects o JOIN object_types ot ON o.type_id = ot.template_id GROUP BY ot.name ORDER BY n DESC",
).all() as Array<{ name: string; n: number }>;
console.log('Objecten per type:');
for (const t of types) console.log("  " + t.name + ": " + t.n);

// Check unknown titles
const unknowns = db.prepare(
  "SELECT count(*) as n FROM objects WHERE title = '(unknown)'",
).get() as { n: number };
console.log("\nOnbekende titels: " + unknowns.n);

// Direct app → process links
const appProc = db.prepare(
  "SELECT count(*) as n FROM v_app_processes",
).get() as { n: number };
console.log("App → Proces links: " + appProc.n);

// Sample app → process
const sampleAP = db.prepare(
  "SELECT app_title, process_title FROM v_app_processes LIMIT 5",
).all() as Array<{ app_title: string; process_title: string }>;
console.log("\nVoorbeeld app → proces:");
for (const r of sampleAP) console.log("  " + r.app_title + " > " + r.process_title);

// Process → function links
const procFunc = db.prepare(
  "SELECT count(*) as n FROM v_process_functions",
).get() as { n: number };
console.log("\nProces → Functie links: " + procFunc.n);

// Function → actor links
const funcActor = db.prepare(
  "SELECT count(*) as n FROM v_function_actors",
).get() as { n: number };
console.log("Functie → Actor links: " + funcActor.n);

// Full chains
const chains = db.prepare(
  "SELECT app_title, process_title, function_title, actor_title FROM v_impact_chain WHERE function_title IS NOT NULL LIMIT 5",
).all() as Array<{ app_title: string; process_title: string; function_title: string | null; actor_title: string | null }>;
console.log("\nVolledige impactketens:");
for (const c of chains) {
  console.log("  " + c.app_title + " > " + c.process_title + " > " + (c.function_title ?? "-") + " > " + (c.actor_title ?? "-"));
}

// Locaties
const locs = db.prepare(
  "SELECT loc_title, count(*) as n FROM v_app_locations GROUP BY loc_title",
).all() as Array<{ loc_title: string; n: number }>;
console.log("\nLocaties:");
for (const l of locs) console.log("  " + l.loc_title + ": " + l.n + " apps");

// Relationship types
const relTypes = db.prepare(
  "SELECT relationship_type, count(*) as n FROM relationships GROUP BY relationship_type ORDER BY n DESC",
).all() as Array<{ relationship_type: string; n: number }>;
console.log("\nRelatie types:");
for (const r of relTypes) console.log("  " + r.relationship_type + ": " + r.n);

db.close();
