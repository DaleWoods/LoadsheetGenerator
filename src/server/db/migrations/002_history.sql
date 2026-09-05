-- What has been generated, so a recurring load sheet does not have to be
-- described from scratch every time (§6.7).

CREATE TABLE IF NOT EXISTS generation (
  id         TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  user_id    TEXT REFERENCES app_user (id) ON DELETE SET NULL,
  -- Kept alongside user_id so the history still reads sensibly after an account
  -- is removed: who did it is part of the record, not a join that can vanish.
  username   TEXT NOT NULL,
  name       TEXT NOT NULL,
  item_type  TEXT NOT NULL,
  direction  TEXT NOT NULL,
  -- What was asked for. This is the specification request, not the generated
  -- files: replaying it regenerates from today's library, which is the point -
  -- a sheet reused next month picks up an attribute learned since.
  request    TEXT NOT NULL,
  summary    TEXT NOT NULL,
  filename   TEXT NOT NULL,
  row_count  INTEGER NOT NULL DEFAULT 0,
  -- What the user did with it: downloaded, or saved into the library.
  outcome    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS generation_created ON generation (created_at);
CREATE INDEX IF NOT EXISTS generation_user ON generation (user_id);
