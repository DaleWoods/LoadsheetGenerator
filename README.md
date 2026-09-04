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
  library/       the supplied extraction, and turning it into library records
  domain/        catalogue, template matching, house style, resolve, generate,
                 validate, package
  services/      the library store, and one request to one load sheet
  routes/        the HTTP API
  db/            schema, migrations, seeding
src/web/         the field picker (Mode B)
```

## The shape of it

    specification object -> resolve -> write .impex + CSV -> validate -> package

Both input modes produce a specification object and nothing else. The field
picker builds one from ticked fields; the natural-language mode resolves a
sentence into one. Neither writes ImpEx text - that happens once, in
`domain/generate.ts`, from a specification whose columns have been checked
against the library. An attribute the library does not have still generates, but
it is marked unverified on screen and commented in the script.

Templates are reference knowledge, not output. Every sheet is composed on the
fly; the app never hands back a stored file.

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

## Before you say it works

- `npm run build`
- `npx vitest run`
- For anything a user touches, actually drive it rather than trusting a
  typecheck. Report what you verified and what you did not.
