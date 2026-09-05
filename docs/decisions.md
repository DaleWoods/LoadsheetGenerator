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
