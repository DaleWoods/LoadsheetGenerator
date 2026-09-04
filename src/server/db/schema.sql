-- Baseline schema. Changes after this go in db/migrations/, never here: the
-- baseline is applied first and the migrations after it, so a column in both
-- breaks a fresh database.

CREATE TABLE IF NOT EXISTS library_template (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  source_path TEXT NOT NULL,
  folder      TEXT NOT NULL,
  direction   TEXT NOT NULL,
  data_source TEXT NOT NULL,
  item_types  TEXT NOT NULL,
  origin      TEXT NOT NULL,
  verified    INTEGER NOT NULL DEFAULT 0,
  notes       TEXT,
  -- The record itself, as JSON. A library template is a document - blocks,
  -- columns, modifiers, the CSV header row it was paired with - and the app
  -- always reads it whole, so splitting it across five tables would buy
  -- nothing but joins. The columns above exist to filter on.
  document    TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS library_template_direction ON library_template (direction);
CREATE INDEX IF NOT EXISTS library_template_origin ON library_template (origin);

CREATE TABLE IF NOT EXISTS schema_migration (
  id         TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);
