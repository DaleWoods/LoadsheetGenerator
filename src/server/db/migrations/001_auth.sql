-- Individual logins (§4). The app is reachable from the internet once it is
-- deployed, so it is not a public link: everyone who uses it has an account,
-- and every session belongs to one of them.

CREATE TABLE IF NOT EXISTS app_user (
  id            TEXT PRIMARY KEY,
  -- Stored lower-cased. Usernames are compared case-insensitively, and doing
  -- that in the column rather than in every query keeps the unique index honest.
  username      TEXT NOT NULL UNIQUE,
  display_name  TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'member',
  disabled      INTEGER NOT NULL DEFAULT 0,
  -- Set when an administrator resets a password; the app then makes the user
  -- choose a new one before it will let them do anything else.
  must_change   INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  last_seen_at  TEXT
);

CREATE TABLE IF NOT EXISTS user_session (
  -- The token is never stored, only its SHA-256. A leaked database backup then
  -- does not hand over live sessions.
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS user_session_user ON user_session (user_id);
CREATE INDEX IF NOT EXISTS user_session_expiry ON user_session (expires_at);
