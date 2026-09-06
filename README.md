# WOSG Load Sheet Generator

Generates SAP Commerce (Hybris) ImpEx load sheets - the `.impex` script and its
matching CSV, zipped - for the recurring import scenarios WOSG runs, plus the
export-direction scripts. Uploading the zip into HAC stays a manual step.

Built to `docs/loadsheet-generator-spec.md`. The knowledge it works from is the
December-21 production export of 329 files, extracted to 109 script definitions
in `src/server/library/loadsheet-extraction-raw.json` and digested for humans in
`docs/load-sheet-template-library.md`.

## Where things are

```
src/shared/      types and pure functions both halves use, browser included
  impex.ts       reading and writing ImpEx column expressions
  library.ts     what a library record is
  spec.ts        the specification object both input modes produce
  fieldTypes.ts  what kind of value a column expects
  csv.ts         CSV reading and writing
  paste.ts       lining pasted rows up with the columns
src/server/
  auth/          passwords, and who is allowed through
  library/       the supplied extraction, and turning it into library records
  domain/        catalogue, template matching, house style, resolve, generate,
                 validate, export queries, package
  services/      the library store, and one request to one load sheet
  routes/        the HTTP API
  db/            schema, migrations, seeding
  integrations/  the model that turns a description into a specification
src/web/         signing in, the field picker (Mode B), the describe box (Mode A),
                 export selection, the repository, history, accounts
docs/
  loadsheet-generator-spec.md        what was asked for
  load-sheet-template-library.md     the house conventions, written up
  wosg-flexisearch-queries.md        WOSG's own backoffice queries, for reference
  decisions.md                       every deliberate departure, and why
```

## The shape of it

    specification object -> resolve -> write .impex + CSV -> validate -> package

Both input modes produce a specification object and nothing else. The field
picker builds one from ticked fields; the natural-language mode resolves a
sentence into one - and its result lands in the field picker rather than going
straight to a download, so it can be checked and changed. Neither writes ImpEx
text: that happens once, in `domain/generate.ts`, from a specification whose
columns have been checked against the library. An attribute the library does not
have still generates, but it is marked unverified on screen, commented in the
script, and the download waits on an explicit confirmation.

Templates are reference knowledge, not output. Every sheet is composed on the
fly; the app never hands back a stored file.

An export carries a FlexibleSearch query, which finds the rows the column list
then writes out. It is generated to WOSG's own conventions — an item type
aliased by its initials, a catalog version restricted by joining through
CatalogVersion to Catalog — taken from `docs/wosg-flexisearch-queries.md` and
pinned by tests. The `setTargetFile` and `exportItemsFlexibleSearch` lines
around it are still written from the ImpEx documentation, and every generated
export says so until a real export script is added to the library.

A generated script never carries a PK or a filter nobody asked for: PKs
identify different rows in different environments, and an export that silently
drops rows produces a CSV that looks complete either way. See `CLAUDE.md` for
how these calls are made.

## The repository

One store, two shelves. **Already run against production** is the scripts WOSG
had before this app - the extraction captured each one's header line, CSV
parameters and the CSV's heading row, but never the file, so those entries
describe rather than reopen. **Made here** is what has been saved since: those
carry the request that made them, so they open straight back into the picker
and download again.

Each shelf is a folder tree, built from the path in the record's name, so it
mirrors the loadsheets folder the scripts are kept in. Folders start closed and
carry a count; a search opens them all, because a match several folders down is
no use behind a closed door.

Saving puts a sheet on the shelf. Saying it *imported cleanly* additionally
makes it evidence: only then does it join the catalogue, and only then does an
attribute it carries stop being flagged as unverified.

## Running it

```
npm install --legacy-peer-deps
npm run seed          # creates the SQLite database and loads the 109 records
npm run dev           # the API on :3000 (it seeds itself on first boot)
npm run dev:web       # the UI on :5173, proxying /api to :3000
npm test
npm run build         # server to dist/, UI to dist-web/, then `npm start`
```

Defaults to SQLite at `data/loadsheets.db`. Set `DB_DRIVER=postgres` and
`DATABASE_URL` for a real database. `ANTHROPIC_API_KEY` switches on the
natural-language mode; it is read from the environment and never committed.

Everything behind `/api` needs a session, so set
`BOOTSTRAP_ADMIN_USERNAME` and `BOOTSTRAP_ADMIN_PASSWORD` to get the first
account - a database with nobody in it cannot be signed in to. Setting them
again resets that password, which is the way back in when the only
administrator is locked out. Add everyone else in the app, under Accounts.
Running the built service over plain http locally also needs
`SESSION_COOKIE_SECURE=false`.

## Deploying

`render.yaml` is a Render blueprint: New -> Blueprint -> this repository.
It creates the Postgres database and the web service and prompts for the
administrator username and password, which are the only two values you must
set. Without `DB_DRIVER=postgres` the app falls back to SQLite on the local
disk, which Render wipes on every deploy - the library re-seeds itself, but
anything added since is gone.

## Keeping the documents current

`README.md`, `CLAUDE.md` and `docs/decisions.md` are updated in the same commit
as the change they describe, never afterwards. See the top of `CLAUDE.md` for
which belongs where.

## Before you say it works

- `npm run build`
- `npx vitest run`
- For anything a user touches, actually drive it rather than trusting a
  typecheck. Report what you verified and what you did not.
