-- What happened to a sheet after it left the app.
--
-- Until now only success taught the app anything: ticking "it imported cleanly"
-- promotes a sheet to evidence. A sheet that failed in HAC taught it nothing at
-- all, and that is the half worth more - the next person building the same
-- thing should be told before they build it, not after.

ALTER TABLE generation ADD COLUMN reported_at TEXT;
-- What HAC said, in the user's paste. Kept whole rather than parsed: the
-- message is for a person to read, and guessing at its structure would only
-- lose the part that mattered.
ALTER TABLE generation ADD COLUMN failure_note TEXT;
