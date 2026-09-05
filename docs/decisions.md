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

Open. Reaching stage 4 (export-direction scripts).

## Mode A resolves to a specification, never to script text

The model chooses an item type and attributes from the library's own catalogue.
There is no field in its schema for a modifier, a qualifier or a header line, and
everything it returns is checked against the catalogue before a specification is
built: an item type the library does not have is refused with a question, an
attribute it does not have is flagged unverified, and a column shape the library
has never written is dropped in favour of the one the closest sheet uses. This
is §6.1 read strictly - a hallucinated modifier should have nothing to travel
through.
