# Decisions

Departures from, and answers to, the requirements spec
(`loadsheet-generator-spec.md`). The spec is not edited; this is the record of
what was settled and why.

## §9b Q1 — how the app judges a "genuine" new attribute

**Settled: generate it, flag it, and hold the download behind a tick.**

With no live SAP connection the app cannot tell a genuine new attribute from a
typo, so "genuine" can only mean the user asserted it. The sheet is generated
and shown - flagged on screen, and commented in the `.impex` - but the download
button stays disabled until the user confirms they have checked the attribute
exists in SAP Commerce. The server enforces the same thing: packaging refuses
with `unverified.unconfirmed` unless the request carries the confirmation, so
the gate is not a UI decoration.

Considered and rejected: a warning banner alone (nothing stops a typo becoming a
zip that fails at import) and a confirmation before generating (you would be
deciding without having seen what it produces). The gate sits at the download
because that is the step immediately before the file reaches HAC.

## The repository is a view over the library, not a second store

Asked for as "a hub of existing load sheets, plus the new ones, kept
separate". Both shelves are the same table: `origin: 'seed'` is the supplied
production export, `origin: 'user'` is what has been saved from the app. One
store, because they are the same knowledge - the library the generator reads -
and two shelves, because they are different kinds of thing. A supplied record
describes a script that was run before this app existed and cannot be
regenerated: the extraction never included the files. A saved record carries
the request that produced it, so it reopens.

Saving and "it imported cleanly" were separated at the same time. Saving keeps
a sheet for reuse; only the second makes it evidence the catalogue trusts. That
keeps the §9b Q1 gate honest - otherwise saving an unrun sheet would quietly
make its unverified attribute look known and lift the confirmation the download
waits on.

Removing is an administrator's job, and the supplied export cannot be removed
at all: it is the reference the whole app reads, and an empty library re-seeds
itself on the next boot, so deleting one would only look like it worked.

## §9b Q2 — offering a used attribute to the library

**Settled: a "it imported cleanly" button on a sheet with unverified columns.**

Saving stores the generated sheet as a library record with `origin: 'user'` and
`verified: true`, which makes the attribute known: it appears in the field
picker, the resolver may use it, and it stops being flagged. Only the user can
say the import worked, so nothing is saved automatically - the button appears
after the sheet has been downloaded.

## §9b Q3 — export output destination

**Settled: generating the script is the whole job.**

An export script writes its CSV inside SAP Commerce when it is run in HAC, and
with no live connection (§7) the app cannot reach it. So the app names the
target file in the script and in the summary - which is what somebody needs in
order to find it - and collecting it is the user's step, like the upload.

Taking the CSV back afterwards was considered and left out: it would mean
reading a CSV the app did not generate, which §8 puts out of scope for v1.

## The export query mechanics are not from a WOSG script

The supplied extraction captured every export script's header line but not its
`setTargetFile` / `exportItems` lines, so those are written from the ImpEx
documentation. Generated exports say so in their own comments and carry an
`export.mechanicsUnverified` finding, the same treatment an unknown attribute
gets. The column list and its order *are* WOSG's. Replace
`domain/exportQuery.ts` with their wording once a real export script is to
hand.

One thing that had to be got right rather than copied: the catalog version
restriction names the catalog and version as **values**, read out of the
script's own `$catalogVersion` macro. Writing `$catalogVersion` into the query
would have looked reasonable and been nonsense - ImpEx substitutes macros
everywhere in the file, so it would paste a column definition into the middle
of the SQL. The validator refuses any export whose query contains a macro
reference.

## Mode A resolves to a specification, never to script text

The model chooses an item type and attributes from the library's own catalogue.
There is no field in its schema for a modifier, a qualifier or a header line, and
everything it returns is checked against the catalogue before a specification is
built: an item type the library does not have is refused with a question, an
attribute it does not have is flagged unverified, and a column shape the library
has never written is dropped in favour of the one the closest sheet uses. This
is §6.1 read strictly - a hallucinated modifier should have nothing to travel
through.

## The app is written for somebody who reads ImpEx but should not have to

**Corrected.** This section first said the app was written for somebody who
does *not* read ImpEx, and several things were built on that: the script folded
away behind a disclosure, a four-step HAC walkthrough, an intention to add a
first-run tutorial. It was wrong. The people using this write load sheets and
ImpEx already; what they lack is the time to write another one by hand, not the
knowledge to read it.

So the standard is: **do the work for them, and show them everything.** Never
explain their own job back to them.

What that keeps, because it serves an expert just as well:

- The generated CSV rendered as a spreadsheet. A line of commas is not
  something anybody can check by eye, however well they know ImpEx.
- The repository entries leading with a sentence of what a sheet does. That is
  for scanning 109 of them, not for explaining what a load sheet is.
- The validator findings, and the confirmation on an unverified attribute. An
  expert wants a wrong column caught before HAC does, not after.

What it reversed:

- **The script is shown, not hidden.** It is the thing they are being asked to
  trust, and it was behind a click.
- **No walkthrough after the download.** What is left says only what is
  specific to the file in the zip: the names that have to stay, the encoding
  and offset it was built for, and the tick that promotes it to evidence.
- **No first-run tutorial**, and no plainer word for `columnsOffset`,
  `INSERT_UPDATE` or a macro. Those are the vocabulary, not jargon to be
  translated away.

The look is still meant to be warm rather than austere. Warm is not the same as
simplified — it is the difference between a tool that is pleasant to spend the
afternoon in and one that assumes you have never seen a header line.

## The repository is two scrolling panes, not one long page

109 sheets rendered as one page ran to about 17,000 pixels, and opening one
near the bottom put its explanation a screen and a half above the click. The
list now scrolls inside its own pane beside a detail panel that stays put, and
the entries sit under their folder - "Akamai", "C&C Restriction", "TrueFalse" -
because that is the name the team already uses for that work. Within a folder
the repeated prefix is dropped from each name, so the title carries the part
that distinguishes it.

The list resets to the top when the search or a filter changes; leaving it
where it was put the first match half under a sticky heading.

## A localized field in two languages is two columns

WOSG writes the UK and US text of a localized attribute as two columns side by
side — `description[lang=$lang]` then `description[lang=$lang2]`, with
`$lang=en` and `$lang2=en_US`. The resolver's guard against the model returning
the same field twice was keyed on the attribute name alone, so the second
language was dropped as a duplicate: a sheet asked for in UK and US English
came out with the UK column only, and a note saying it had left out a second
copy of description. The guard now keys on the attribute *and* the shape, which
is what makes two columns two columns. `columns.duplicate` in the validator is
still the backstop if two genuinely identical columns get through.

Three things followed from it:

- The picker offers a localized field's shapes as **checkboxes**, not radios,
  because "which languages?" is a different question from "append or
  overwrite?" — the first can have more than one answer and each answer is its
  own column.
- The chosen-columns list matched preview columns to ticked fields by attribute
  name, so with two `description` columns both rows pointed at the first and
  removing either removed both. It counts position among the ticked columns
  instead.
- A shape was described as "written per language (lang2)", which does not say
  which language you are getting. It resolves the macro now — "(en_US)".
  `catalogue.macros` holds one row per distinct definition, most-used first, and
  a handful of scripts define `$lang` as `en_US`, so the first row for a name is
  the one to take.

The generator needed no change: given the right specification it already wrote
both columns, declared both macros and gave them distinct CSV headings.

## A sheet is filled in as far as the request goes, and no further

"I want to add Goldsmiths to display on site for 10 SKUs" produced a perfect
ImpEx script and a CSV containing nothing but headings. The request does not
name the SKUs — nothing can invent those — but it names the value for every one
of the ten rows, and typing `Goldsmiths_UK` ten times by hand is the work the
app exists to remove.

The resolver now fills every cell the request gives it and leaves the rest
empty, returning as many rows as the request says (one, when it does not say,
so there is a shape to copy down). The rule it must not break is unchanged: a
cell is left empty rather than guessed at, and a code, SKU or value the request
does not contain is never invented.

An empty key column is normally an error that refuses the zip, and should be —
a sheet somebody believes is finished cannot match anything without it. So the
validator distinguishes the two cases: **every** key cell empty in **every**
row is a sheet waiting to be finished, and gets a warning naming the columns
still to fill in; a row that lost its key among rows that have one is the old
error, unchanged. That is worked out from the rows themselves rather than
carried on a flag, because the rows stay editable right up to the download —
pasting the SKUs in has to end it, and deleting one has to start it.

The warning says the filled values came from what was asked for rather than
from SAP Commerce. It has to: the app cannot check that `Goldsmiths_UK` is the
site uid, only that the request asked for Goldsmiths. That is the same bargain
the unverified attributes strike — generate it, show it, mark it — and it is
better than a blank column, which hides the same guess inside somebody's head
instead.

## The repository is a folder tree, not a list

Grouping 109 sheets by their top folder still left one group of 89, and the
answer to "where is the click-and-collect sheet" was still a scroll. Each shelf
is now the tree the scripts are actually kept in, built by splitting the
record's name on ` / ` — the name *is* the path in the loadsheets folder, so no
new information was needed to draw it. Folders start closed, so the page opens
on six rows rather than 109, and each carries a count of everything beneath it.
A search opens them all and closes them again afterwards, keeping whatever the
reader had opened by hand: a match three folders down is no use behind a closed
door.

## The worked examples have to name real fields

The describe box shipped offering "Set the isEditorsPick flag to true on
Product by SKU". No such attribute exists — not in the library, not in SAP
Commerce — so the app's one worked example of its headline feature was a
request it would itself have flagged as unverified and made the user tick a
box to clear. `describeBox.test.ts` now checks every attribute named in an
example against the catalogue.

## The export is copied from exports that have run

A generated export failed in HAC with no error. The reason was not one thing,
and none of it was guesswork that could have been reasoned out: the original
extraction captured each export's header line but not the file around it, so
the mechanics were written from the ImpEx documentation. Dale then sent the
loadsheets folder itself — 107 scripts, 34 of them exports — and
`docs/wosg-loadsheets/` now holds them.

Set against a working script, five things were wrong:

- **No `$catalogVersion` in the header line.** A Product is identified by its
  code *and* its catalog version, so a header declaring only
  `code[unique=true]` cannot identify the rows the query found. An export now
  always carries it, in front of the key, as theirs do.
- **No macros, and therefore no catalog restriction in the query.** The macros
  are only emitted for columns that reference them, so the missing
  `$catalogVersion` column silently took the restriction with it and the export
  ran across every catalog version at once.
- **An `enableCodeExecution` line.** None of their 34 exports has one.
- **No blank lines.** After a header line ImpEx reads what follows as that
  header's value lines, and the export call is a quoted field like any other —
  run up against the header it can be taken for data and never execute, which
  is an export that finishes having done nothing. 31 of their 34 separate them.
- **LF line endings.** All 107 of their scripts are CRLF. The CSV alongside
  always was; the script was the odd one out.

The query itself was rewritten to the form 17 of their exports share, down to
the mixed casing (`as p` beside `AS cv`) and the mixed `{p:catalogversion}` /
`{cv.pk}` reference styles. Copied rather than tidied: it is the form that has
run against production, which beats a neater one that has not. The catalog
restriction lives in the ON clauses so the WHERE carries only what was asked
for, and all three selections the app can produce — a code list, a code
wildcard, a wildcard on another attribute — have a counterpart among them.

The target file is `products.csv` in 28 of the 34, whatever the sheet is
called. It is collected from HAC straight after the run, so it is a scratch
name; naming it after the sheet was the app's own idea.

`exportShape.test.ts` reproduces three of their exports line for line from the
app's own generator, and the three reference scripts sit beside it. That is
what a test for this is worth: not that the output matches what I believed the
documentation said, but that it matches a file that has run.

With the mechanics copied rather than inferred, `export.mechanicsUnverified`
is gone. It said "compare this against a known-good export before relying on
it", and that comparison is now a test.

## A generated script carries no PK, and no silent filter

Two decisions taken under the standing authority to judge how scripts are
written (see `CLAUDE.md`), both about what a script has to survive after it
leaves the app.

**No PKs.** WOSG's console queries match on them freely —
`{p:approvalstatus} = 8796100493403`, with "Approved" written down beside it —
and for a query typed into Staging and read once that is fine. A generated
script is run somewhere else later, where the same row has a different PK, so
it returns nothing rather than failing: the worst shape a bug can take. The
generator names things by what they are, the way the catalog restriction names
`masterProductCatalog` and `Staged`, and `export.pkInQuery` warns when a
twelve-digit number reaches a query. Twelve because their PKs are thirteen
digits and a SKU is eight, so it cannot fire on a real product code.

**No filter the user did not ask for.** Several of their product queries
restrict to approved products, and it would have been easy to read that as the
house default. It is not being copied. An export that drops rows without saying
so is worse than one that returns too many: both produce a CSV that looks
complete, and only the second can be checked by looking at it. If restricting
to approved becomes something people want, it belongs on the export panel as a
visible choice with the row count changing in front of them — not in the
generator as a default nobody sees.

## The sheet knows what it is setting; you only tell it which records

Two frictions were left after the app started part-filling rows, and Dale named
both: getting the SKUs into a part-filled sheet, and the handover to HAC.

The first is the shape of most of the work. "Add Goldsmiths to display on site
for 10 SKUs" leaves the app knowing the value for every row and none of the
records. Filling that in by hand meant typing `Goldsmiths_UK` down ten rows in
a textarea. So when every row has values and no key, the rows step offers a box
for a bare list of codes and puts them in beside the values already there. A
list longer than the rows carries the values on to all of them; a list shorter
than the rows drops the extras, because a row nobody named a record for cannot
import.

The second is `NextSteps`, shown when the zip is actually taken. It began as a
four-step HAC walkthrough and was cut to three facts once it was clear the
readers import ImpEx for a living: the two file names that have to stay as they
are, the encoding and `columnsOffset` this CSV was built for, and the tick that
promotes the sheet to evidence. Every one is read back out of the generated
script rather than remembered, because a note describing a different file is
worse than none.

## The Queries tab writes FlexibleSearch, and is checked more lightly on purpose

Same architecture as the load sheet side, one deliberate difference.

The architecture: the model returns a **specification** — types, aliases,
fields, joins, conditions, ordering — and never query text. There is no field
in its schema that holds SQL. Names are checked against a catalogue parsed from
`docs/wosg-flexisearch-queries.md`, and only then does `formatFlexQuery` write
the query. A hallucinated field reaches the screen with a warning beside it
rather than reaching the console unremarked.

The difference: **a query only reads.** A wrong load sheet writes wrong data to
production; a wrong query costs an error message. So an unknown field is a
warning and the query still appears, where an unverified attribute on a load
sheet holds the download until somebody ticks a box. What is not acceptable is
a query appearing with nothing said — one that runs and returns plausible but
wrong rows is how a bad decision gets made, and how a bad load sheet gets built
from its output.

Three checks are firmer than the rest:

- **An export query selects one column, the PK.** Selecting display columns
  instead is exactly the mistake that made a generated export run and write
  nothing, so it is an error rather than a warning.
- **An alias used but never declared** is a join the model forgot; the query
  would not parse.
- **A PK in a condition** is warned about. Their console queries are full of
  them, which is fine for something typed once; a query somebody keeps and runs
  in another environment silently returns nothing.

The shape of the specification was measured, not designed. Across their 82
queries: 43 select with labels, 32 join, 32 have a WHERE, 11 order, 10 are
DISTINCT — all covered. Subselects (5), CASE (7), GROUP BY (2) and UNION (1)
are the tail, and a request needing one gets a question back rather than a
query that half does it.

Parsing their library taught two things worth keeping. Aliases must resolve
inside the query that declares them — resolved across the file, `{o:code}`
landed on PriceRow because another query aliased something else to `o`, and a
catalogue built that way calls good fields unknown and bad ones fine. And their
queries have blank lines *inside* them, so splitting the markdown on blank
lines gave 82 fragments that each began with SELECT and carried no FROM.

## Three things the first Queries deployment got wrong

**The tab was unreadable once tapped.** `button.tab:hover` is specificity
0-1-1 and the primary `button:hover:not(:disabled)` is 0-2-1, so hovering a tab
filled it navy and left the navy text on it. On a phone a tap leaves the
element hovered, so the tab somebody is on stayed unreadable rather than
flickering. The same specificity trap had already been fixed on the repository
card and I fixed that one in place rather than looking for its siblings; it is
in `CLAUDE.md` now.

**The tabs could not all be reached on a phone.** The top bar does not wrap and
the page scrolls vertically, so a fifth tab put Accounts past the edge with no
way to get to it. The nav scrolls sideways now, and under 640px the bar tightens
and the brand name gives up its space.

**The request died as "failed to fetch".** Two changes, because the cause could
not be established from the browser: `max_tokens` came down from 8000 to 3000,
since a query specification is a few hundred tokens and the ceiling was minutes
of possible generation on a request somebody is watching; and the route now logs
its timing and its errors, so the next failure leaves an account of itself in
the Render log. The client gives up at two minutes with a sentence saying so
rather than the browser's bare TypeError.

Also fixed while looking: `flexLibrary()` read its source from `docs/` through a
path that reaches outside `dist/`. That works locally and is a file-not-found on
a deployment - exactly what `copy-assets.mjs` exists to prevent, and it now
copies the query library beside the code that reads it.

## The sites are knowledge the app had to be told

Nothing about which fascias exist, what their order numbers look like, or how a
click-and-collect order differs from a direct one is derivable from the load
sheets or the query library. The app was inferring it. `Goldsmiths_UK` went
into a Display On Site sheet because the model spelled it from the word
"Goldsmiths" — right, and unverifiable. `src/shared/sites.ts` holds it now,
with the uids taken exactly off the Website list in backoffice, and both
prompts carry it: the query writer and the load sheet drafter.

It is a typed module rather than a parsed document. The query library is parsed
because it is 82 queries that would be miserable to retype; this is eleven rows
that want to be exact, and a hand-written markdown table would be one
mis-aligned pipe away from putting orders in the wrong fascia.

**The gaps stay gaps.** Hallmark is a UK base store and its order prefix was
not given, so it has none — a guessed prefix would put orders in the wrong
fascia and look right doing it. The prompt says "order prefix not known" and is
told to say so rather than assume. `sites.test.ts` asserts the absence, so
filling it in is a deliberate act rather than a drift.

The click-and-collect rule is the one that earns its place immediately: a
click-and-collect order is numbered from the store it is collected at — `S`,
then a three or four digit store number, then the order's digits — so it does
*not* carry its site's prefix. That makes "direct orders only, no click and
collects" answerable as "the code does not begin with S", which is exactly what
the first real query asked for and the app could not have known.

Two things were reported inconsistently and are recorded as they were resolved:
Betteridge was given both `usb` and `ubc`, and only `usb` is stored; and the
three Rolex boutique sites are on the Website list but were not named as base
stores, so they are marked as boutiques rather than quietly promoted.

`src/shared/catalogs.ts` is the same idea for the catalog versions. Every
generated sheet restricts itself to one, and the only one the app had ever seen
was `masterProductCatalog` / `Staged` copied out of the scripts — it could not
have answered "the same thing but for Mayors". Each fascia has a product and a
content catalog, both Staged and Online; the Rolex boutiques have content only.

Three things are recorded rather than tidied away. The Backoffice Configuration
Catalog is kept *because* it is marked "do not use" — dropping it would let the
name be invented back in as plausible. Five un-regioned content catalogs
(`Goldsmiths_ContentCatalog` beside `Goldsmiths_UK_ContentCatalog`) sit on the
list next to the regioned ones and nobody has said which is current, so they
carry that sentence rather than a guess. And the list was read from a scrolling
table, so the prompt is told that a version it cannot see may still exist —
absence of evidence, said out loud.
