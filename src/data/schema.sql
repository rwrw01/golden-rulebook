-- BlueDolphin Impact Database — PoC schema
-- Combines BlueDolphin ArchiMate graph with GGM CMDB model
-- SQLite dialect

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ╔══════════════════════════════════════════════════════╗
-- ║  1. OBJECTEN — alle ArchiMate objecten uit BlueDolphin  ║
-- ╚══════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS object_types (
  template_id   TEXT PRIMARY KEY,          -- BD template ID
  name          TEXT NOT NULL,             -- "Applicatie", "Bedrijfsproces", etc.
  name_internal TEXT,                      -- ArchiMate: "application_component"
  category      TEXT,                      -- "Applicatielaag", "Bedrijfslaag", etc.
  ggm_table     TEXT                       -- GGM mapping: "APPLICATIE", "CMDB_ITEM_", etc.
);

CREATE TABLE IF NOT EXISTS objects (
  id            TEXT PRIMARY KEY,          -- BD object ID
  title         TEXT NOT NULL,
  type_id       TEXT NOT NULL REFERENCES object_types(template_id),
  is_template   INTEGER NOT NULL DEFAULT 0, -- "(c)" prefix = catalog template
  synced_at     TEXT NOT NULL,             -- ISO timestamp of last BD sync
  raw_json      TEXT                       -- full BD objectitem response (for later enrichment)
);

CREATE INDEX IF NOT EXISTS idx_objects_type ON objects(type_id);
CREATE INDEX IF NOT EXISTS idx_objects_title ON objects(title);

-- ╔══════════════════════════════════════════════════════╗
-- ║  2. RELATIES — ArchiMate relaties tussen objecten       ║
-- ╚══════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS relationships (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id       TEXT NOT NULL REFERENCES objects(id),
  target_id       TEXT NOT NULL REFERENCES objects(id),
  relationship_type TEXT NOT NULL,          -- "usedby", "assignment", "flow", etc.
  relationship_name TEXT NOT NULL,          -- "wordt gebruikt door", "heeft toekenning van"
  synced_at       TEXT NOT NULL,
  UNIQUE(source_id, target_id, relationship_type)
);

CREATE INDEX IF NOT EXISTS idx_rel_source ON relationships(source_id);
CREATE INDEX IF NOT EXISTS idx_rel_target ON relationships(target_id);
CREATE INDEX IF NOT EXISTS idx_rel_type ON relationships(relationship_type);

-- ╔══════════════════════════════════════════════════════╗
-- ║  3. GGM CMDB — verrijking vanuit Gemeentelijk Gegevensmodel ║
-- ╚══════════════════════════════════════════════════════╝

-- GGM Applicatie-velden die BlueDolphin niet heeft
CREATE TABLE IF NOT EXISTS ggm_applicatie (
  object_id         TEXT PRIMARY KEY REFERENCES objects(id),
  applicatie_url    TEXT,
  beheerstatus      TEXT,                  -- BESCHIKBAAR_STELLEN, FUNCTIONEEL_ONDERSTEUNEN, etc.
  categorie         TEXT,                  -- BBA, KERNAPPLICATIE, KA_BASIS, etc.
  packaging_status  TEXT,
  leverancier       TEXT,
  licentie          TEXT,
  versie            TEXT
);

-- GGM Medewerker/Gebruikerrol koppeling
CREATE TABLE IF NOT EXISTS ggm_gebruikerrol (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  object_id   TEXT NOT NULL REFERENCES objects(id), -- applicatie
  medewerker  TEXT,
  rol         TEXT,                        -- EIGENAAR, FUNCTIONEEL_BEHEERDER, SUPERUSER, etc.
  UNIQUE(object_id, medewerker, rol)
);

-- GGM Koppeling (interfaces/integraties)
CREATE TABLE IF NOT EXISTS ggm_koppeling (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id   TEXT NOT NULL REFERENCES objects(id),
  target_id   TEXT NOT NULL REFERENCES objects(id),
  beschrijving TEXT,
  direct      INTEGER,                     -- boolean: directe koppeling?
  UNIQUE(source_id, target_id)
);

-- ╔══════════════════════════════════════════════════════╗
-- ║  4. INCIDENTEN — voor latere incidentregistratie        ║
-- ╚══════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS incidents (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  title           TEXT NOT NULL,            -- "Storing ESB"
  description     TEXT,                     -- Vrije tekst van coördinator
  description_ai  TEXT,                     -- AI-vertaling voor eindgebruikers
  severity        TEXT CHECK(severity IN ('critical','high','medium','low')),
  status          TEXT CHECK(status IN ('open','investigating','resolved','closed')) DEFAULT 'open',
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at     TEXT,
  created_by      TEXT                      -- incidentcoördinator
);

-- Koppeling incident → getroffen objecten
CREATE TABLE IF NOT EXISTS incident_impact (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  incident_id   INTEGER NOT NULL REFERENCES incidents(id),
  object_id     TEXT NOT NULL REFERENCES objects(id),
  impact_type   TEXT NOT NULL,              -- "direct" (bron), "process" (geraakt), "actor" (informeren)
  confidence    REAL,                       -- AI confidence score 0-1
  notify        INTEGER NOT NULL DEFAULT 0, -- moet deze actor geïnformeerd worden?
  UNIQUE(incident_id, object_id, impact_type)
);

CREATE INDEX IF NOT EXISTS idx_impact_incident ON incident_impact(incident_id);
CREATE INDEX IF NOT EXISTS idx_impact_object ON incident_impact(object_id);

-- ╔══════════════════════════════════════════════════════╗
-- ║  5. SYNC METADATA — voor automatisering                ║
-- ╚══════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS sync_runs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at    TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at   TEXT,
  status        TEXT CHECK(status IN ('running','completed','failed')) DEFAULT 'running',
  objects_synced  INTEGER DEFAULT 0,
  relations_synced INTEGER DEFAULT 0,
  error_message TEXT
);

-- ╔══════════════════════════════════════════════════════╗
-- ║  6. VIEWS — kant-en-klare impactanalyse queries         ║
-- ╚══════════════════════════════════════════════════════╝

-- Directe impactketen: App → Bedrijfsproces
CREATE VIEW IF NOT EXISTS v_app_processes AS
SELECT
  a.id AS app_id, a.title AS app_title,
  p.id AS process_id, p.title AS process_title,
  r.relationship_name
FROM objects a
JOIN relationships r ON r.source_id = a.id
JOIN objects p ON p.id = r.target_id
WHERE a.type_id = '532fffd0b41281c17ce263b9'  -- Applicatie
  AND p.type_id = '531721d799ffecf9b5c8b1ad'  -- Bedrijfsproces
  AND r.relationship_type = 'usedby';

-- Directe impactketen: App → Locatie
CREATE VIEW IF NOT EXISTS v_app_locations AS
SELECT
  a.id AS app_id, a.title AS app_title,
  l.id AS loc_id, l.title AS loc_title,
  r.relationship_name
FROM objects a
JOIN relationships r ON r.source_id = a.id
JOIN objects l ON l.id = r.target_id
WHERE a.type_id = '532fffd0b41281c17ce263b9'  -- Applicatie
  AND l.type_id = '532ffa70b41281c17ce263b5'  -- Locatie
  AND r.relationship_type = 'assignment';

-- Impactketen: Bedrijfsproces → Bedrijfsfunctie
CREATE VIEW IF NOT EXISTS v_process_functions AS
SELECT
  p.id AS process_id, p.title AS process_title,
  f.id AS function_id, f.title AS function_title,
  r.relationship_name
FROM objects p
JOIN relationships r ON r.source_id = p.id OR r.target_id = p.id
JOIN objects f ON (f.id = r.target_id OR f.id = r.source_id) AND f.id != p.id
WHERE p.type_id = '531721d799ffecf9b5c8b1ad'  -- Bedrijfsproces
  AND f.type_id = '5852ada13bf3ff08c475d1fd'  -- Bedrijfsfunctie
  AND r.relationship_type = 'aggregation';

-- Impactketen: Bedrijfsfunctie → Actor (afdeling)
CREATE VIEW IF NOT EXISTS v_function_actors AS
SELECT
  f.id AS function_id, f.title AS function_title,
  a.id AS actor_id, a.title AS actor_title,
  r.relationship_name
FROM objects f
JOIN relationships r ON r.source_id = f.id OR r.target_id = f.id
JOIN objects a ON (a.id = r.target_id OR a.id = r.source_id) AND a.id != f.id
WHERE f.type_id = '5852ada13bf3ff08c475d1fd'  -- Bedrijfsfunctie
  AND a.type_id = '532ff9dbb41281c17ce263b2'  -- Actor
  AND r.relationship_type = 'assignment';

-- App → Infrastructuur (Node, Database, Netwerk, Netwerk Device, Apparaat)
CREATE VIEW IF NOT EXISTS v_app_infrastructure AS
SELECT
  a.id AS app_id, a.title AS app_title,
  i.id AS infra_id, i.title AS infra_title,
  ot.name AS infra_type,
  r.relationship_name
FROM objects a
JOIN relationships r ON r.source_id = a.id
JOIN objects i ON i.id = r.target_id
JOIN object_types ot ON i.type_id = ot.template_id
WHERE a.type_id = '532fffd0b41281c17ce263b9'
  AND i.type_id IN (
    '5faa8d3aad3fc213ecfca3a6',  -- Node
    '61b76634ad3fbd0b08644d4d',  -- Database
    '610a7682ad3fc20e30dd2cba',  -- Netwerk
    '610a76b0ad3fc0094ca7eca0',  -- Netwerk Device
    '5f917a72145c106fa002aed3'   -- Apparaat
  );

-- Locatie → welke apps draaien daar
CREATE VIEW IF NOT EXISTS v_location_apps AS
SELECT
  l.id AS loc_id, l.title AS loc_title,
  a.id AS app_id, a.title AS app_title
FROM objects l
JOIN relationships r ON r.target_id = l.id
JOIN objects a ON a.id = r.source_id
WHERE l.type_id = '532ffa70b41281c17ce263b5'
  AND r.relationship_type = 'assignment';

-- Volledige impactanalyse: App → wie informeren?
CREATE VIEW IF NOT EXISTS v_impact_chain AS
SELECT DISTINCT
  ap.app_id, ap.app_title,
  ap.process_id, ap.process_title,
  pf.function_id, pf.function_title,
  fa.actor_id, fa.actor_title
FROM v_app_processes ap
LEFT JOIN v_process_functions pf ON pf.process_id = ap.process_id
LEFT JOIN v_function_actors fa ON fa.function_id = pf.function_id;
