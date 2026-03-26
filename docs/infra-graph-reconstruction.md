# BlueDolphin Infrastructure Graph Reconstruction

## Context

The BlueDolphin impact analysis database (`data/impact.db`, SQLite) contains enterprise architecture objects and their ArchiMate relationships, scraped from the BlueDolphin presentation API. This document describes how to reconstruct infrastructure diagrams (like network topology views) from the relational data, for use in a 3D.js (or D3.js/Three.js) visualization.

## Database schema (relevant tables)

```sql
-- Objects: all ArchiMate objects (applications, networks, devices, locations, etc.)
CREATE TABLE objects (
  id            TEXT PRIMARY KEY,   -- BlueDolphin object ID (24-char hex)
  title         TEXT NOT NULL,      -- Display name (e.g., "DMZ_IA_Beheer")
  type_id       TEXT NOT NULL,      -- FK to object_types.template_id
  is_template   INTEGER DEFAULT 0,  -- 1 = catalog template, skip in queries
  raw_json      TEXT                -- Full API response (nullable)
);

-- Object types: ArchiMate element types
CREATE TABLE object_types (
  template_id   TEXT PRIMARY KEY,
  name          TEXT NOT NULL,      -- "Netwerk", "Netwerk Device", "Applicatie", etc.
  category      TEXT                -- ArchiMate layer
);

-- Relationships: ArchiMate relationships between objects
CREATE TABLE relationships (
  source_id       TEXT NOT NULL,     -- FK to objects.id
  target_id       TEXT NOT NULL,     -- FK to objects.id
  relationship_type TEXT NOT NULL,   -- "association", "composition", "flow", "assignment", etc.
  relationship_name TEXT NOT NULL,   -- Dutch label: "geassocieerd met", "is onderdeel van"
  UNIQUE(source_id, target_id, relationship_type)
);
```

## Key object types and their template IDs

| Type | template_id | Count | ArchiMate layer |
|------|-------------|-------|-----------------|
| Applicatie | `532fffd0b41281c17ce263b9` | 770 | Application |
| Locatie | `532ffa70b41281c17ce263b5` | 40 | Physical |
| Node | `5faa8d3aad3fc213ecfca3a6` | 300 | Technology |
| Database | `61b76634ad3fbd0b08644d4d` | 159 | Technology |
| Netwerk | `610a7682ad3fc20e30dd2cba` | 103 | Technology |
| Netwerk Device | `610a76b0ad3fc0094ca7eca0` | 89 | Technology |
| Apparaat | `5f917a72145c106fa002aed3` | 78 | Technology |
| Technologie-interface | `5a783e5bbbe61e0c4860e747` | 105 | Technology |
| Bedrijfsproces | `531721d799ffecf9b5c8b1ad` | 357 | Business |
| Actor | `532ff9dbb41281c17ce263b2` | 158 | Business |

## Relationship types (ArchiMate semantics)

| relationship_type | Meaning | Visual hint |
|-------------------|---------|-------------|
| `association` | Peer connection (bidirectional) | Solid line, no arrow |
| `composition` | Child is part of parent (source contains target) | Diamond arrow at parent |
| `aggregation` | Grouping (weaker than composition) | Open diamond |
| `assignment` | Allocated to (e.g., app assigned to location) | Dotted line |
| `realization` | Implements/realizes | Dashed line with triangle |
| `flow` | Data/traffic flow (directional) | Arrow showing direction |
| `access` | Reads/writes data | Dashed line with arrow |
| `usedby` | Used by (reverse serving) | Arrow |
| `specialization` | Is-a / inherits from | Triangle arrow |

## How infrastructure diagrams work in BlueDolphin

### The composition pattern (critical insight)

Infrastructure objects follow a **composition hierarchy**. A firewall cluster contains individual firewalls. A network device contains technology interfaces (IP addresses). Understanding this is essential for graph traversal.

Example: Palo Alto firewall topology
```
Palo Alto Firewall Cluster (Netwerk Device)
├── composition → Palo Alto STK (Netwerk Device)
├── composition → Palo Alto TWH (Netwerk Device)
├── association → DMZ_IA_Beheer (Netwerk)
├── association → DMZ_ADFS_PRD (Netwerk)
├── association → DMZ_Gemnet (Netwerk)
├── association → ... (30+ networks)
├── composition → 80.113.24.67 (Technologie-interface)
├── flow → HTTPS - 176.117.57.23 (Technologie-interface)
└── association → Stadskantoor (Locatie)
```

The parent (Cluster) holds ALL the network associations. The children (STK, TWH) are individual hardware. A diagram showing "Palo Alto STK connected to DMZ networks" actually traverses: STK → composition → Cluster → association → Networks.

### Query: reconstruct a network device's full topology

```sql
-- Step 1: Find the device and its parent cluster
WITH device_tree AS (
  -- The device itself
  SELECT id, title, type_id FROM objects WHERE id = :deviceId
  UNION ALL
  -- Its parent (composition target)
  SELECT o.id, o.title, o.type_id
  FROM relationships r
  JOIN objects o ON o.id = r.target_id
  WHERE r.source_id = :deviceId AND r.relationship_type = 'composition'
  UNION ALL
  -- Its parent (composition source, reverse direction)
  SELECT o.id, o.title, o.type_id
  FROM relationships r
  JOIN objects o ON o.id = r.source_id
  WHERE r.target_id = :deviceId AND r.relationship_type = 'composition'
)
-- Step 2: Get all related objects from device + parent
SELECT DISTINCT
  o.id, o.title, ot.name as type,
  r.relationship_type, r.relationship_name
FROM device_tree dt
JOIN relationships r ON r.source_id = dt.id OR r.target_id = dt.id
JOIN objects o ON (o.id = r.target_id OR o.id = r.source_id) AND o.id != dt.id
JOIN object_types ot ON o.type_id = ot.template_id
WHERE o.is_template = 0;
```

### Query: all networks connected to a specific network device

```sql
SELECT DISTINCT
  n.id, n.title,
  r.relationship_type
FROM objects nd
-- Include parent cluster
LEFT JOIN relationships r_parent ON
  (r_parent.source_id = nd.id OR r_parent.target_id = nd.id)
  AND r_parent.relationship_type = 'composition'
-- Get the cluster ID
JOIN objects cluster ON (
  cluster.id = CASE
    WHEN r_parent.source_id = nd.id THEN r_parent.target_id
    ELSE r_parent.source_id
  END
)
-- Get networks connected to the cluster
JOIN relationships r ON
  (r.source_id = cluster.id OR r.target_id = cluster.id)
  AND r.relationship_type = 'association'
JOIN objects n ON
  (n.id = r.target_id OR n.id = r.source_id)
  AND n.id != cluster.id
  AND n.type_id = '610a7682ad3fc20e30dd2cba'  -- Netwerk
WHERE nd.id = :networkDeviceId;
```

## Graph construction for 3D visualization

### Node types and suggested visual properties

```typescript
interface GraphNode {
  id: string;
  title: string;
  type: string;        // "Netwerk", "Netwerk Device", "Locatie", etc.
  // Suggested visual mapping:
  // color: use ArchiMate standard colors (see below)
  // size: scale by relationship count
  // shape: sphere for devices, cube for networks, cylinder for databases
  // layer: y-position based on ArchiMate layer
}

interface GraphEdge {
  source: string;       // source object id
  target: string;       // target object id
  type: string;         // "association", "composition", "flow", etc.
  label: string;        // Dutch relationship name
  // Suggested visual mapping:
  // composition: thick line, diamond end marker
  // association: medium line, no arrows
  // flow: thin line with arrow, animated particles
  // assignment: dashed line
}
```

### ArchiMate color scheme

```typescript
const ARCHIMATE_COLORS: Record<string, string> = {
  'Applicatie':            '#80b1d3',  // Blue
  'Applicatie-interface':  '#80b1d3',
  'Applicatieservice':     '#80b1d3',
  'Bedrijfsproces':        '#ffffb3',  // Yellow
  'Bedrijfsfunctie':       '#ffffb3',
  'Actor':                 '#ffffb3',
  'Bedrijfsservice':       '#ffffb3',
  'Node':                  '#8dd3c7',  // Green
  'Netwerk':               '#8dd3c7',
  'Netwerk Device':        '#8dd3c7',
  'Apparaat':              '#8dd3c7',
  'Database':              '#8dd3c7',
  'Technologie-interface': '#8dd3c7',
  'Technologieservice':    '#8dd3c7',
  'Locatie':               '#fb8072',  // Pink/red
};
```

### Layered Y-position for 3D layout

ArchiMate layers map naturally to vertical position in 3D space:

```typescript
const LAYER_Y: Record<string, number> = {
  // Business layer (top)
  'Actor':                 4,
  'Bedrijfsfunctie':       3,
  'Bedrijfsproces':        3,
  'Bedrijfsservice':       3,
  // Application layer (middle)
  'Applicatie':            2,
  'Applicatie-interface':  2,
  'Applicatieservice':     2,
  // Technology layer (bottom)
  'Node':                  1,
  'Netwerk Device':        1,
  'Database':              1,
  'Netwerk':               0,
  'Apparaat':              0,
  'Technologie-interface': 0,
  // Physical (ground)
  'Locatie':              -1,
};
```

### Existing API endpoint for graph data

The server (`src/ui/api.ts`) already exposes:

```
GET /api/graph?id={objectId}&depth={depth}
```

Response format:
```json
{
  "nodes": [
    { "id": "610a8de1...", "title": "Palo Alto STK", "type": "Netwerk Device" }
  ],
  "edges": [
    { "source": "610a8de1...", "target": "610a88ae...", "label": "geassocieerd met", "type": "association" }
  ]
}
```

This endpoint does recursive BFS traversal up to `depth` hops. For infrastructure diagrams, use `depth=2` to traverse through composition parents to reach associated networks.

### Practical example: reconstructing the firewall diagram

To reproduce the screenshot showing DMZ networks connected to Palo Alto STK:

```
GET /api/graph?id=610a8de1ad3fc0094ca7ecc3&depth=2
```

This returns:
1. Palo Alto STK (depth 0)
2. Palo Alto Firewall Cluster (depth 1, via composition)
3. All DMZ networks (depth 2, via association from cluster)
4. Stadskantoor, Tweelinghuis (depth 2, via association from cluster)
5. Technology interfaces / IP addresses (depth 2, via composition from cluster)

For the 3D view, filter by type to show only the relevant layer:
- Show: Netwerk, Netwerk Device, Locatie
- Hide: Technologie-interface (too many IP addresses clutter the view)

## Database statistics (as of 2026-03-15)

```
Total objects:  3,676 (all real, no templates)
Total relations: 11,171
Object types:   36

Top types by count:
  Applicatie:             770
  Bedrijfsobject:         460
  Package:                365
  Bedrijfsproces:         357
  Node:                   300
  Gegevensobject:         177
  Database:               159
  Actor:                  158
  Applicatieservice:      150
  Netwerk:                103
  Netwerk Device:          89
  Apparaat:                78
  Locatie:                 40
```

## Files reference

| File | Purpose |
|------|---------|
| `src/data/schema.sql` | Database schema + views |
| `src/data/sync-helpers.ts` | Shared sync functions (auth, upsert, fetch) |
| `src/data/sync-broad.ts` | Broad sync script (configurable call limit) |
| `src/data/enrich-infra.ts` | Enrich infrastructure stubs with full detail |
| `src/ui/api.ts` | REST API with `/api/graph`, `/api/impact`, `/api/search` |
| `src/ui/diagram.ts` | SVG diagram generator (2D, ArchiMate layered) |
| `data/impact.db` | SQLite database (the single source of truth) |
