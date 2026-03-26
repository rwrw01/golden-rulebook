import Database from 'better-sqlite3';

const db = new Database('data/impact.db', { readonly: true });

console.log('=== Query 1: Objects per infra type ===\n');
const query1 = db.prepare(`
SELECT ot.name, count(*) as cnt FROM objects o 
JOIN object_types ot ON o.type_id = ot.template_id 
WHERE ot.name IN ('Netwerk', 'Netwerk Device', 'Node', 'Database', 'Apparaat', 'Locatie') 
AND o.is_template = 0 
GROUP BY ot.name
ORDER BY cnt DESC
`).all();
console.table(query1);

console.log('\n=== Query 2: Composition relationships (parent-child) ===\n');
const query2 = db.prepare(`
SELECT ot1.name as source_type, ot2.name as target_type, count(*) as cnt 
FROM relationships r 
JOIN objects o1 ON o1.id = r.source_id 
JOIN objects o2 ON o2.id = r.target_id 
JOIN object_types ot1 ON o1.type_id = ot1.template_id 
JOIN object_types ot2 ON o2.type_id = ot2.template_id 
WHERE r.relationship_type = 'composition' 
AND ot1.name IN ('Netwerk', 'Netwerk Device', 'Node', 'Database', 'Apparaat', 'Locatie')
AND ot2.name IN ('Netwerk', 'Netwerk Device', 'Node', 'Database', 'Apparaat', 'Locatie')
GROUP BY ot1.name, ot2.name 
ORDER BY cnt DESC
`).all();
console.table(query2);

console.log('\n=== Query 3: Association relationships (peer connections) ===\n');
const query3 = db.prepare(`
SELECT ot1.name as source_type, ot2.name as target_type, count(*) as cnt 
FROM relationships r 
JOIN objects o1 ON o1.id = r.source_id 
JOIN objects o2 ON o2.id = r.target_id 
JOIN object_types ot1 ON o1.type_id = ot1.template_id 
JOIN object_types ot2 ON o2.type_id = ot2.template_id 
WHERE r.relationship_type = 'association' 
AND (ot1.name IN ('Netwerk', 'Netwerk Device') OR ot2.name IN ('Netwerk', 'Netwerk Device'))
GROUP BY ot1.name, ot2.name 
ORDER BY cnt DESC
`).all();
console.table(query3);

console.log('\n=== Query 4: Sample Palo Alto device topology ===\n');
const query4 = db.prepare(`
SELECT o.title, ot.name, r.relationship_type, o2.title as related_title, ot2.name as related_type 
FROM objects o 
JOIN object_types ot ON o.type_id = ot.template_id 
JOIN relationships r ON r.source_id = o.id 
JOIN objects o2 ON o2.id = r.target_id 
JOIN object_types ot2 ON o2.type_id = ot2.template_id 
WHERE o.title LIKE '%Palo Alto%Cluster%' 
LIMIT 30
`).all();
console.table(query4);

console.log('\n=== Query 5: Locatie assignments ===\n');
const query5 = db.prepare(`
SELECT ot1.name, ot2.name, r.relationship_type, count(*) as cnt 
FROM relationships r 
JOIN objects o1 ON o1.id = r.source_id 
JOIN objects o2 ON o2.id = r.target_id 
JOIN object_types ot1 ON o1.type_id = ot1.template_id 
JOIN object_types ot2 ON o2.type_id = ot2.template_id 
WHERE r.relationship_type = 'assignment' 
AND (ot1.name = 'Locatie' OR ot2.name = 'Locatie') 
AND (ot1.name IN ('Netwerk Device', 'Node', 'Apparaat') OR ot2.name IN ('Netwerk Device', 'Node', 'Apparaat')) 
GROUP BY ot1.name, ot2.name, r.relationship_type
`).all();
console.table(query5);

console.log('\n=== Composition hierarchy: all NetwerkDevice children (count) ===\n');
const query6 = db.prepare(`
SELECT 
  nd.title as parent_device,
  count(*) as child_count
FROM objects nd
JOIN relationships r ON r.source_id = nd.id AND r.relationship_type = 'composition'
JOIN objects child ON child.id = r.target_id
WHERE nd.type_id = '610a76b0ad3fc0094ca7eca0'
GROUP BY nd.id, nd.title
ORDER BY child_count DESC
LIMIT 15
`).all();
console.table(query6);

console.log('\n=== Networks per NetwerkDevice (via composition parent) ===\n');
const query7 = db.prepare(`
SELECT 
  nd.title as netwerk_device,
  COUNT(DISTINCT n.id) as network_count,
  GROUP_CONCAT(n.title, ', ') as networks
FROM objects nd
LEFT JOIN relationships r_child ON (
  r_child.source_id = nd.id AND r_child.relationship_type = 'composition'
)
LEFT JOIN objects child ON child.id = r_child.target_id
LEFT JOIN relationships r_assoc ON (
  (r_assoc.source_id = nd.id OR r_assoc.source_id = child.id)
  AND r_assoc.relationship_type = 'association'
)
LEFT JOIN objects n ON n.id = r_assoc.target_id AND n.type_id = '610a7682ad3fc20e30dd2cba'
WHERE nd.type_id = '610a76b0ad3fc0094ca7eca0'
GROUP BY nd.id, nd.title
HAVING network_count > 0
ORDER BY network_count DESC
LIMIT 10
`).all();
console.table(query7);

db.close();
