# WOSG Load Sheet Generator — Requirements Specification
*Draft v1 — to be refined once example load sheets are supplied*

## 1. Overview
An internal web app that generates SAP Commerce (Hybris) ImpEx load sheets — the ImpEx script + matching CSV, bundled as a zip — for the many recurring import scenarios WOSG runs (new product loads, facet/attribute updates, associated-product loads, etc.). The app replaces manual authoring of the ImpEx script and manual column-matching against the CSV. The final upload into the SAP Commerce Admin Console (HAC) stays a manual step, done by the user.

## 2. Problem Statement
WOSG maintains a large and growing number of distinct load sheets (product data, facets, individual attributes, associated products, and more), each hand-built: an ImpEx script written to match a CSV's exact column order and types, then zipped and uploaded. This is slow, error-prone (mismatched columns, wrong modifiers, wrong catalogVersion, incorrect boolean/collection formatting), and relies on whoever's building it remembering the right ImpEx syntax for that item type.

## 3. Goals
- Cut the time to produce a correct, ready-to-upload load sheet from scratch.
- Remove column-mismatch and syntax errors as a class of bug.
- Capture WOSG's load sheet knowledge (item types, attributes, modifiers, conventions) in one reusable place instead of it living in individual people's heads/old files.
- Support both a "just describe what you need" flow and a "tick the fields you need" flow, since both come up (the latter especially for bulk new-product loads with large CSVs).

## 4. Users & Access
- Primary user: Dale, plus test/dev team members who currently hand-build load sheets.
- Same auth pattern as [[wosg-tools-hub]] and the other Claude Code apps — individual logins, not a public link.

## 5. Key Concepts / Glossary
- **Load sheet**: the pairing of an ImpEx script (`.impex`) and one or more CSV data files, zipped together, used to import/update data in SAP Commerce.
- **ImpEx script**: defines the target item type, the header line (which columns map to which attributes, with modifiers like `unique=true`, `mode=append`, `allownull`), and either inline `VALUE` lines or a reference to an external CSV via `impex.includeExternalDataMedia(...)`.
- **Modifiers**: per-column ImpEx settings — e.g. `unique`, `mode` (append/remove), `allownull`, `virtual`, `translator`, `lang`, collection delimiter, `columnOffset` (as hit in the [[see-more-styles-impex]] "unknown type" bug).
- **Field types encountered**: string, boolean (`true`/`false` toggle), number, date, reference/code lookup (e.g. product code, category code), collection/multi-value (delimited), localized attributes (per language/catalogVersion).

## 6. Functional Requirements

### 6.1 Mode A — Natural-language generation ("describe what you want")
- User describes the load sheet in plain English (e.g. *"Create a load sheet that sets the isEditorsPick flag on Product to true/false by SKU"*).
- App uses its stored knowledge of item types/attributes (seeded from the example load sheets Dale will provide, expandable over time) to infer: target item type, unique key, the attribute(s) involved, correct modifiers, and correct value formatting per field type (e.g. boolean → `true`/`false`, not `1`/`0`).
- App asks a clarifying follow-up only when the request is genuinely ambiguous — otherwise it generates a first draft directly.
- **Unknown attributes:** if the requested attribute isn't in the library, the app may still generate a load sheet for it, but must mark the output clearly as unverified (both on screen and as a comment in the generated `.impex`) so the user knows to check it against SAP Commerce before importing. It must not silently invent an attribute, and must not guess at a near-match to a known attribute name without saying so — if the request looks like a typo or near-miss of something in the library, it should surface that as a "did you mean" rather than quietly substituting. See Section 9 Q2 note on how "genuine" gets judged.
- Output: ImpEx script + a CSV template (header row, and optionally a couple of example rows) + short plain-English summary of what was generated, so the user can sanity-check before downloading.

### 6.2 Mode B — Field picker ("tick the fields you need")
- User picks a target item type (Product, Category, etc.), then ticks which attributes/columns are needed from a list for that type.
- Primary use case: bulk new-product loads, where the CSV can run to hundreds/thousands of rows and many columns.
- App generates the ImpEx header line and script matching the ticked fields, in the right order, with correct modifiers per field type — plus a CSV with those exact column headers.
- **Both output paths supported:** (a) download the empty CSV template + ImpEx to fill in externally, or (b) paste/upload row data into the app against the generated template, so the zip comes out fully populated. Path (b) is where the validation in 6.4 earns its keep, since the app can check the supplied data against the expected column types before packaging.

### 6.3 Shared — Load sheet template library
- A stored library of known item types and their attributes/modifiers/conventions.
- **v1 seed now built from the supplied `Loadsheets - 21-12-21` export** (329 files) — see the companion `load-sheet-template-library.md` (human-readable catalog + conventions) and `loadsheet-extraction-raw.json` (machine-readable: every header line, every `includeExternalDataMedia` call, matched CSV headers, macros). Covers ~109 distinct script definitions across Categories, Facets, Orders, Products (by far the largest group — ~85 scripts), Solr, and Stores, spanning item types `Product`, `VariantProduct`, `Category`, `ProductFacetType`, `ProductFacetValue`, `Order`, `SpecialBrandFeature`, `SolrIndexedProperty`, `SolrSearchQueryProperty`, `SiteCategoryAttribute`, and the multi-block store setup (`Address`, `OpeningSchedule`, `WeekdayOpeningDay`, `AurumPointOfService`, `StoreDescription`, `Media`, `StoreBrand`).
- Needs a way to add a new item type or attribute to the library without a redeploy (similar to the settings-screen approach used on [[wosg-tools-hub]]), since WOSG's load sheet list will keep growing.
- **Templates are reference knowledge, not fixed outputs.** The library exists so the app knows WOSG's conventions (which modifiers a field type takes, how the preamble is built, how booleans and collections are formatted); every load sheet is composed on the fly from the user's specification. The app should never just hand back an existing template file unchanged. Where several near-identical variants exist in the library — the three Master Product Loadsheet column sets, the four Metadata subsets, the Append/Remove pairs — all are retained as separate reference entries rather than merged, because their differences are exactly the signal the generator needs.
- **Important finding:** the `columnsOffset` parameter on `includeExternalDataMedia` (whether a CSV has a leading blank "Type" column or not) isn't fully self-consistent across the existing scripts, and getting it wrong is exactly what caused the [[see-more-styles-impex]] "unknown type" bug. The generator should copy this value from the closest matching library template rather than deriving it from first principles, and should validate the generated CSV's column count against the header line before finalising output. Full detail in the template library doc, Section 1.
- **Future phase (not v1):** eventually pull attribute definitions from SAP Commerce directly, rather than relying solely on curated examples. Agreed as desirable but deliberately deferred — v1 has no live SAP connection (Section 7), and adding one changes the app's auth, network, and environment story significantly. The v1 library schema should be designed so live-sourced definitions can be merged in later without restructuring it.

### 6.4 Shared — CSV ↔ ImpEx validation
- Validates that CSV column headers/order match what the ImpEx script's value line or `includeExternalDataMedia` call expects.
- Validates field values against expected type where feasible (e.g. flags a non-true/false value in a boolean column).
- Surfaces the specific class of bug already hit once ([[see-more-styles-impex]] — wrong `columnOffset` causing "unknown type" errors) as a built-in check where the pattern applies.

### 6.5 Export-direction script generation (in scope for v1)
- As well as generating import load sheets, the app generates **export** scripts — the ones that pull data out of SAP Commerce as a CSV rather than loading data in.
- Patterns present in the supplied examples and to be supported: export by explicit SKU/product list, export by SKU wildcard, and export by attribute-value wildcard (e.g. the Roundel and Special Brand wildcard exports).
- Output here is a single `.impex` file, not a zip — export scripts don't have a paired CSV going in.
- Both input modes should work for exports too: describing it in natural language ("export SKU and description for every Rolex product"), or ticking which fields to include from a chosen item type.

### 6.6 Shared — Output packaging
- Bundles the generated `.impex` file and CSV(s) into a single zip, matching WOSG's existing upload format for the Admin Console.
- User downloads the zip and uploads it manually — actual SAP Commerce upload/import stays out of scope (see Section 8).

### 6.7 Shared — History / reuse
- Keep a record of previously generated load sheets (what was requested, what was generated) so similar future requests can be generated faster/more consistently, and so recurring load sheets (like the See More Styles one) don't need re-describing from scratch each time.

## 7. Non-Functional Requirements
- Deployment: same pattern as Dale's other Claude Code apps — isolated Render blueprint, reachable from [[wosg-tools-hub]].
- Auth: individual logins, consistent with the hub app.
- No live connection to SAP Commerce required for v1 — the app only needs to *produce* files, not talk to Hybris directly.

## 8. Out of Scope (v1)
- Automatically uploading/importing the generated zip into SAP Commerce — stays a manual step in the Admin Console.
- Validating against SAP Commerce's live type system (unless answered otherwise in Section 9) — v1 relies on the template library built from supplied examples.
- Editing/patching *existing* CSVs that weren't generated by the app.
- Live connection to SAP Commerce for attribute definitions — agreed as a future phase, not v1 (see §6.3).

## 9. Decisions Made
1. **Mode B data entry** — support both: download the empty template to fill in externally, *and* paste/upload data into the app for a fully populated zip. (§6.2)
2. **Unknown attributes** — allowed, but only for genuine new attributes, and clearly flagged as unverified in the output. (§6.1)
3. **Live SAP Commerce attribute reading** — agreed in principle, deferred beyond v1; library schema to be built so it can be added later. (§6.3)
4. **Scale of the library** — 109 distinct script definitions across ~330 files. Full catalog in `load-sheet-template-library.md`.
5. **Export-direction scripts** — in scope for v1. (§6.5)
6. **Near-identical template variants** — all retained separately as reference entries; every load sheet is composed on the fly from the specification rather than served from a stored file. (§6.3)

## 9b. Remaining Questions
1. **How does the app judge a "genuine" new attribute?** With no live SAP connection in v1, the app can't actually verify an attribute exists — so "genuine" can only mean "the user asserted it and the app flagged it". Worth deciding whether that's an explicit confirmation step ("this isn't in the library — confirm you want to proceed") or just a warning banner on the output. The risk otherwise is that a typo'd attribute name silently becomes a generated load sheet that fails at import time.
2. **Should unknown attributes, once used successfully, be offered for adding to the library?** A one-click "this worked, save it as a template" would grow the library naturally and is cheap to build, but only if the user is the one confirming it worked.
3. **Export output destination** — export scripts produce a CSV *inside SAP Commerce* when run. Does the app need to do anything with that output (it can't reach it without a live connection), or is generating the script the whole job?

## 10. Next Steps
1. ~~Dale sends over example load sheets~~ **Done** — `Loadsheets - 21-12-21` export processed; see `load-sheet-template-library.md` and `loadsheet-extraction-raw.json`.
2. ~~Confirm scope questions~~ **Done** — see Section 9.
3. Settle the three remaining questions in Section 9b (they affect UI, not architecture, so the build can start without them if needed).
4. Produce a short build prompt for Claude Code, following the same pattern as the other app specs, using the template library as the seed data for the app's knowledge base.
