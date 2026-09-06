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

## The app is written for somebody who does not read ImpEx

The people who need a load sheet are merchandisers and e-commerce staff; the
people who read ImpEx are a subset of them. So the interface leads with what a
thing *does* and keeps the script itself one click away rather than in front:

- The build page is seven numbered steps rather than a wall of controls.
- The generated CSV is rendered as a spreadsheet, because a line of commas is
  not something anybody can check. The `.impex` is behind a disclosure.
- A validator finding is headed "Fix this" / "Worth a look" / "For
  information" rather than error / warning / info.
- A repository entry leads with a sentence - "Loads 2 fields onto Product
  records, from a CSV" - and drops the file path, the CSV name and the column
  offset from the card face. All three are still in the panel beside it, which
  is where somebody who wants them is looking.

None of this hides a decision the user has to make. The unverified-attribute
tick and the download button stay together and stay plain.

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

## The export query is written the way WOSG write one

An export ImpEx carries a FlexibleSearch query: it finds the rows, and the
column list decides what of each row is written out. So the query is not a
detail around the sheet, it is half of what the sheet does — and
`docs/wosg-flexisearch-queries.md`, the team's own query library, is the
reference for how they write one. Two conventions in it are consistent enough
to follow, and the generator now does:

- **An item type is aliased by its initials.** `Catalog AS c`,
  `CatalogVersion AS cv`, `BaseStore AS bs`, `AurumPriceRow AS pr`,
  `CategoryProductRelation AS cpr`. The app used to write `AS i`, for "item",
  which came out of the ImpEx documentation and appears nowhere in their work.
- **A catalog version is restricted by joining**, through CatalogVersion to
  Catalog, comparing `{c:id}` and `{cv:version}` as values. Two independent
  queries in the library write it that way. The app expressed the same
  restriction as a nested `IN ({{ SELECT ... }})` subselect: valid
  FlexibleSearch, and not what a WOSG script looks like.

The colon form (`{p:code}`) is theirs too, 1120 uses against 173 of the dot
form; the app already used it. `exportQuery.test.ts` pins all of this, with
their queries quoted in the test.

What the library does **not** settle is the two lines that wrap the query.
Those queries are written to be read in the Admin console — they `SELECT`
display columns, where `exportItemsFlexibleSearch` needs the PK of the items
to export — and none of them carries a `setTargetFile` or `exportItems` line.
So `export.mechanicsUnverified` stays, narrowed to say exactly that: the
columns and the query are WOSG's, the two lines around them are from the
documentation. One real export script would close it.

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

The second is `NextSteps`, shown when the zip is actually taken. Its facts are
read back out of the generated script — the file name, the encoding, how many
heading lines are skipped — rather than written from a remembered example,
because a checklist describing a different file is worse than none. The HAC
steps themselves are short and name no buttons: a control that has since moved
teaches people to distrust the rest of the list, and the process is not
something the app can see. It says so, and invites correction.

Both were built for an audience that has never opened an ImpEx file, which is
who Dale says will be using it.
