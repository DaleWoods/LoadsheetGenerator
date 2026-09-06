# Working on this repository

WOSG Load Sheet Generator. Node + TypeScript, one deployment. Built to
`docs/loadsheet-generator-spec.md`, seeded from the load sheet export described
in `docs/load-sheet-template-library.md`.

## Keep the two documents current, in the same commit

`README.md` and this file are the only description of the app anyone reads.
**A change that alters what the app does, or how somebody works on it, updates
them in the same commit** - not afterwards. A document that lags is worse than
none: it becomes a list of things that used to be true, and people stop
believing the parts that are still right.

- `README.md` is for somebody using or picking up the app: what it does, how
  it is arranged, how to run and deploy it.
- `CLAUDE.md` (this file) is for somebody changing it: the rules that are not
  obvious from the code and the mistakes already made once.
- `docs/decisions.md` is the running record of deliberate departures and why.
  Every non-obvious choice goes here, with the reasoning that would otherwise
  have to be rediscovered.

Do not describe a number, a label or a list that the code derives - name the
behaviour instead. "The folder each script lives in becomes a folder in the
tree" survives a reorganisation; "the six folders" does not.

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
  a script WOSG has already run. The model's schema in
  `integrations/anthropic.ts` has no field a modifier could travel in, and
  `services/resolveService.ts` re-checks everything it says against the
  catalogue - including whether an attribute exists, which is the app's verdict
  and not the model's. Keep both properties when changing either file.

- **An unverified attribute holds the download.** A sheet carrying an attribute
  the library does not know is generated and flagged, but not packaged until the
  user confirms they have checked it exists in SAP Commerce - in the UI and, so
  it means something, in `packageLoadSheet` too. See `docs/decisions.md`.

- **An attribute the library does not have still generates**, but it is marked
  unverified on screen and as a comment in the `.impex`. A near miss to a known
  name is surfaced as a "did you mean", never substituted.

- **Validate before packaging.** Column count and order between the header line
  and the CSV, TRUE/FALSE in flag columns, the offset against the layout. The
  checks read the files as written, not the model they came from, so a generator
  bug surfaces the same way a bad specification does. A finding at error
  severity stops the zip.

- **Everything behind `/api` needs a session, and the guard is applied to the
  whole surface** in `index.ts`, not route by route - so a route added later is
  protected by default. `requireSignedIn` is a session alone (what changing your
  own password needs); `requireUser` also insists the password is the user's
  own rather than one an administrator handed out.

- **An export's query names values, never macros.** ImpEx substitutes macros
  everywhere in the file, so a `$catalogVersion` inside a FlexibleSearch query
  pastes a column definition into the SQL. The catalog and version are read out
  of the script's own macro and written as literals; the validator refuses any
  export query containing a `$`.

- **The catalogue is built from verified records only.** A sheet saved for
  reuse but not yet run is in the repository and can be reopened, but it is not
  evidence - letting it into the catalogue would quietly make an unverified
  attribute look known and lift the confirmation the download waits on. Saying
  "it imported cleanly" is what promotes a record. `loadLibrary` returns both:
  `templates` (verified, what the generator copies conventions from) and `all`
  (everything, for the repository).

- **History keeps the request, not the files.** Reusing an entry regenerates
  against today's library, so a sheet run again next month picks up an
  attribute learned since. Keeping the output would make history a drawer of
  stale files, which is what this app replaces.

- **Schema changes go in a migration**, never in `schema.sql`. The baseline is
  applied first and the migrations after it, so a column in both breaks a fresh
  database.

- **Both SQL dialects.** PostgreSQL and SQLite. Use `?` placeholders; the driver
  rewrites them.

- **Careful with React memos that feed the preview.** The preview effect reruns
  when the request object changes identity, and the paste alignment reads its
  column labels back out of the last preview - so a memo over dependency objects
  loops: every preview makes a new request, which makes another preview. The
  request is built from a JSON key for that reason.

- **Comments explain why, not what.** The code is written to be read by someone
  deciding whether a change is safe.

## Before you say it works

- `npm run build`
- `npx vitest run`
- `README.md`, `CLAUDE.md` and `docs/decisions.md` updated if the change
  touched what they describe.
- For anything a user touches, actually drive it. "Typechecks" is not "works".
- Report what you verified and what you did not.
