-- Every action worth accounting for, for an administrator.
--
-- Separate from `generation`, which is a working record - what was built, so it
-- can be built again. This is the other question: who did what, and when. A
-- sheet that reached production came from somebody, and when something is wrong
-- with the data the first question is which sheet and whose.

CREATE TABLE IF NOT EXISTS audit_event (
  id         TEXT PRIMARY KEY,
  at         TEXT NOT NULL,
  -- Kept alongside user_id for the same reason `generation` does: who did it is
  -- part of the record, not a join that disappears when an account does. Null
  -- only for a sign-in that failed before anybody was identified.
  user_id    TEXT REFERENCES app_user (id) ON DELETE SET NULL,
  username   TEXT NOT NULL,
  -- A stable code - 'sheet.downloaded', 'account.created' - so the screen can
  -- present each kind in its own shape rather than printing a sentence.
  action     TEXT NOT NULL,
  -- The same event in a line of English, written when it happened. Kept rather
  -- than derived so an old event still reads correctly after the wording of a
  -- newer one changes.
  summary    TEXT NOT NULL,
  -- Whatever that action is worth knowing about, as JSON. Shape varies by
  -- action and the screen renders per action.
  detail     TEXT NOT NULL DEFAULT '{}',
  -- Who, from where. Behind a proxy this is the forwarded address.
  ip         TEXT
);

CREATE INDEX IF NOT EXISTS audit_event_at ON audit_event (at);
CREATE INDEX IF NOT EXISTS audit_event_action ON audit_event (action);
CREATE INDEX IF NOT EXISTS audit_event_user ON audit_event (user_id);
