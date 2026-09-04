# Working on this repository

WOSG Load Sheet Generator. Node + TypeScript, one deployment. Built to
`docs/loadsheet-generator-spec.md`, seeded from the load sheet export described
in `docs/load-sheet-template-library.md`.

## Things that will bite you

- **`columnsOffset` is copied, never computed.** A CSV with the leading
  "Type (Leave Blank)" column reads at offset 0; one without it at -1. Getting
  this wrong is what caused a real production import to fail with "unknown
  type" errors, and it is not derivable from the columns - so it is copied from
  the closest library template, together with the CSV layout it belongs to, and
  the pair is re-checked against the file that was actually written. Never
  copy one without the other.

- **The library is evidence, not configuration.** Every list the app works from
  - item types, attributes, the shapes an attribute is written in, the CSV
  headings, which fields are flags, how the preamble is built - is derived from
  the stored templates when they are read. If you find yourself typing a list of
  attribute names, it should be coming from `buildCatalogue()` instead. The one
  hand-written constant is `HOUSE_CSV_CONVENTION`, which stands in when nothing
  matches, and it is what 56 of the 59 external-CSV scripts do.

- **Nothing writes ImpEx text except the generator.** Both input modes produce a
  specification object; `domain/generate.ts` turns one into files. In
  particular the natural-language mode must never emit script text - a
  hallucinated modifier would reach production output with nothing in between.
  A column arrives as an attribute name and options, and its modifiers come from
  a script WOSG has already run.

- **An attribute the library does not have still generates**, but it is marked
  unverified on screen and as a comment in the `.impex`. A near miss to a known
  name is surfaced as a "did you mean", never substituted.

- **Validate before packaging.** Column count and order between the header line
  and the CSV, TRUE/FALSE in flag columns, the offset against the layout. The
  checks read the files as written, not the model they came from, so a generator
  bug surfaces the same way a bad specification does. A finding at error
  severity stops the zip.

- **Schema changes go in a migration**, never in `schema.sql`. The baseline is
  applied first and the migrations after it, so a column in both breaks a fresh
  database.

- **Both SQL dialects.** PostgreSQL and SQLite. Use `?` placeholders; the driver
  rewrites them.

- **Comments explain why, not what.** The code is written to be read by someone
  deciding whether a change is safe.

## Before you say it works

- `npm run build`
- `npx vitest run`
- For anything a user touches, actually drive it. "Typechecks" is not "works".
- Report what you verified and what you did not.
