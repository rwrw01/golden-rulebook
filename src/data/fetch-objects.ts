/**
 * Quick fetch: ophalen van specifieke BD objecten via hun ID
 * Usage: npx tsx src/data/fetch-objects.ts <id1> <id2> ...
 */
import { getHeaders, fetchApi, DELAY_MS, sleep } from './sync-helpers.js';

const ids = process.argv.slice(2);
if (ids.length === 0) {
  console.error('Usage: npx tsx src/data/fetch-objects.ts <objectId> [objectId2] ...');
  process.exit(1);
}

const headers = getHeaders();
console.log('Auth OK, fetching', ids.length, 'objects...\n');

for (const id of ids) {
  try {
    const d = await fetchApi('/api/objectitem/' + id, headers) as {
      object_title?: string;
      title?: string;
      object_type?: { name: string };
      related_bluedolphin_objects?: Array<{
        object_id: string;
        object_title: string;
        object_type: { name: string };
        relationship: { type: string; name: string };
      }>;
    };

    const title = d.object_title ?? d.title ?? '(unknown)';
    const typeName = d.object_type?.name ?? 'onbekend';
    const rels = d.related_bluedolphin_objects ?? [];

    console.log(`=== ${title} ===`);
    console.log(`Type: ${typeName}`);
    console.log(`Relaties: ${rels.length}`);

    for (const r of rels) {
      console.log(`  ${r.object_type.name} [${r.relationship.type}] ${r.object_title}`);
    }
    console.log('');
  } catch (err) {
    console.error(`Fout bij ${id}:`, err);
  }

  await sleep(DELAY_MS);
}
