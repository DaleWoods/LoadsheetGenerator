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

## Who decides how a script is written

Dale has left the shape of the ImpEx, the load sheets and the queries to
whoever is working on this. That is authority to decide, not licence to invent:
the ordering below is the standard.

1. **A WOSG script that has done this.** The library is 109 of them and it is
   the strongest evidence there is. `columnsOffset` and the CSV layout are
   *only* ever copied from one.
2. **A convention consistent across their work.** Two or more examples agreeing
   makes a house style worth following - the initials alias and the joined
   catalog restriction in `docs/wosg-flexisearch-queries.md` are that.
3. **Judgement, said out loud.** Where the evidence is thin, silent or
   contradictory, decide on the merits and write down the reasoning in
   `docs/decisions.md`. Do not stretch one example into a rule it does not
   support, and do not copy something across from a different context because
   it is the only example to hand - their console queries are written to be
   read once by a person, and a generated script is not.

Two things override any evidence, because they are about what a generated
script has to survive:

- **Nothing environment-specific.** A PK identifies a row in one environment
  and something else in the next. Their queries are full of them, with the
  meanings noted alongside, and that is fine for a query typed into Staging.
  A generated script names things by what they are - `{c:id} =
  'masterProductCatalog'` - and `export.pkInQuery` warns when one gets through.
- **Nothing that quietly narrows a result.** Several of their product queries
  filter to approved (`{p:approvalstatus} = 8796100493403`). An export that
  drops rows without saying so is worse than one that returns too many: the CSV
  looks complete either way, and only one of them can be checked. If a filter
  like that becomes wanted, it is a visible choice on the export panel, never a
  default.

## Who this is for

People who write load sheets and ImpEx already. What they are short of is the
hour it takes to write another one by hand, not the knowledge to read it.

**Do the work for them, and show them everything.** Never explain their own job
back to them: no walkthrough of how to import in HAC, no first-run tutorial, no
plainer word for `columnsOffset` or `INSERT_UPDATE` - that is the vocabulary,
not jargon. The generated script is shown, not folded away, because it is what
they are being asked to trust.

Plain writing still earns its place where it saves time rather than assumes
ignorance: the CSV drawn as a spreadsheet, because a line of commas cannot be
checked by eye; a sentence saying what a repository sheet does, because there
are 109 to scan. The line to hold is that the app does the typing and the
checking, and hides none of the result.

## Things that will bite you

- **`docs/wosg-loadsheets/` is 107 scripts WOSG have run.** It is the answer to
  almost any "how should this be written" question, and it is worth grepping
  before reasoning from the ImpEx documentation - an export written from the
  documentation failed in HAC with no error, and every one of the five reasons
  was visible in these files. `exportShape.test.ts` holds the generator to
  three of them line for line.

- **`src/shared/sites.ts` and `src/shared/catalogs.ts` are business knowledge,
  not derived data.** The fascias, their uids, their order-number prefixes, the
  click-and-collect rule and the catalog versions cannot be worked out from the
  library - the app has to be told. Both prompts carry them. Where a value is
  not known it is absent and the prompt says so; never fill one in to make the
  table look complete, because a wrong prefix puts orders in the wrong fascia
  and a wrong catalog writes to the wrong one, and both look right doing it.

- **A `<button>` that is not a primary action needs the element in its
  selector.** The primary `button:hover:not(:disabled)` rule is specificity
  0-2-1, so a bare `.tab:hover` or `.repo-open:hover` loses to it and the
  element fills navy with dark text on it - unreadable, and on a phone a tap
  leaves it that way rather than flickering. Write
  `button.thing:hover:not(:disabled)`. This has now cost two bugs.

- **Anything the compiled server reads at runtime is copied into `dist/` by
  `scripts/copy-assets.mjs`.** Reading a path outside `dist/` works locally,
  where the repository is right there, and is a file-not-found on a deployment.
  The query library lives in `docs/` because it is also a document somebody
  reads, and it is copied beside the code that reads it.

- **A query is checked more lightly than a load sheet, and deliberately.** It
  reads; a wrong one costs an error message rather than wrong data in
  production. An unknown field warns and the query still appears. Do not
  tighten that into a load sheet's confirmation gate - but do not remove the
  warning either, because a query that returns plausible wrong rows is how a
  bad load sheet gets built from its output. `flexValidate.ts` holds the line.

- **An export's query is half of what the export does.** It finds the rows; the
  column list decides what of each row is written. Never put a `$macro` inside
  a query: ImpEx substitutes macros everywhere in the file, so `$catalogVersion`
  would paste a column definition into the middle of the SQL. And an export
  header without `$catalogVersion` cannot identify a Product, which is a failure
  that reports nothing.

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
