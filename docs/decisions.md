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
