# Load Sheet Generator — project brief

*A summary for a non-technical reader. Last updated 9 November 2026.*

---

## In one paragraph

Watches of Switzerland Group's online catalogue is changed by uploading **load
sheets** into SAP Commerce — pairs of files that have to agree with each other
exactly, and that fail silently when they don't. This app writes them. You
describe the change you want in a sentence, or tick the fields you want to
change, and it hands back the script and the spreadsheet, zipped and already
checked against the 300-odd load sheets the business has actually run. It also
writes the database queries that go with them. It does not upload anything
itself — that stays a deliberate human step.

---

## The problem it solves

Every change to the online catalogue — a price, a product description, a facet,
a store's opening hours — goes into SAP Commerce as a load sheet. A load sheet is
**two files that must agree**:

- a **script** that says which fields are being changed and in what order, and
- a **spreadsheet** that holds the actual values, one row per record.

The conventions are unforgiving and they are not documented anywhere outside the
files themselves. The column order in the spreadsheet has to match the column
order in the script. One particular setting has to be `0` or `-1` depending on
whether a certain blank column is present. Catalogue and language names have to
be declared at the top or nothing resolves.

The expensive part is **how it fails**. A load sheet with a mistake in it
usually does not produce an error. It runs, reports nothing, and changes
nothing — or it exports an empty file. The person who submitted it has no
message to read and no line number to look at. During this project we hit
exactly that: an export that "failed with no error" in the admin console, which
turned out to have five separate causes, none of them visible from the screen.

So in practice the job is done by **copying an old file**. Find one from the
folder of 300+ that did something close to what you want, copy it, edit it, hope
you spotted every difference. That works well when you've done it before and
have the right example to hand. It goes quietly wrong when you haven't.

**What the app changes:** the conventions stop being folklore. They are read out
of the real files, applied automatically, and checked before you get the
download.

---

## How it works, step by step

**1. Sign in.** Accounts are created by an administrator. Everything a person
does is recorded (see *Audit*, below).

**2. Say what you want.** Two routes, and the page makes clear they are
alternatives:

- **Describe it.** Type a sentence — *"update the price and description for
  these SKUs in the UK and US"* — and the app works out which fields that means.
  This is the main route.
- **Pick the fields.** Browse the catalogue of known fields and tick what you
  want. Always available, and it's also where the described version lands, so a
  draft can be checked and corrected rather than taken on trust.

**3. It drafts.** The description is turned into a field list, a target
catalogue, and — where the sentence contained them — actual values. If the
sentence is ambiguous, it **asks a question and tells you to add the answer to
your description and search again**, rather than guessing. If it can identify a
field but not its value, it **says so and leaves the cell empty** rather than
inventing one. Naming the gap is treated as a better outcome than filling it
wrongly.

**4. Check and fill.** The draft arrives in the field picker. Columns, rows and
values are all visible and editable. Any field the app cannot find in its
reference library still works, but it is flagged on screen, flagged in the
script, and the download waits for you to confirm you meant it.

**5. It checks its own work.** **41 distinct checks** run before anything is
handed over — column order against the spreadsheet, the offset rule, declared
catalogues and languages, duplicate columns, rows that are only part-filled,
query structure, and the specific traps that made the real export fail silently.

**6. Download.** You get a zip with the script and the spreadsheet in it, plus a
short note on screen of what to do with them. You can also save the sheet to the
shared **Repository** so the next person can start from it.

**7. Import it yourself.** The app never touches SAP Commerce. Uploading the zip
into the admin console stays a manual step, on purpose — the people who use this
already know how to run a load sheet, and a human looking at the file before it
runs is a safety net worth keeping.

### The other tabs

- **Write a query.** The same idea applied to database queries: *"all orders
  from the last week with the order number and date"* becomes a working
  FlexibleSearch query, written in the group's own house style and validated
  against the real table and field names before you see it.
- **Repository.** The shared library of saved sheets, organised the way the
  original folder was — by Products, Orders, Categories, Facets, Stores, Search.
- **History.** Every sheet produced, **including the ones that failed.**
  Failures are recorded deliberately, so the app can tell the next person that a
  particular combination of fields has gone wrong before.
- **Accounts** and **Audit** (administrators only). Audit records every action —
  sign-ins and refused sign-ins, sheets described, downloaded, saved and failed,
  queries written, accounts changed, repository deletions — **12 kinds of event
  in total**, each presented as a readable line rather than a log dump.

---

## The knowledge it works from

This is the part that makes the output trustworthy, and it is all derived from
the group's own files rather than written from general knowledge:

| Source | What came out of it |
|---|---|
| **329 real load sheet files** from the production export | **109 script definitions**, machine-read |
| **107 scripts** kept in the app as reference | **34** of them exports, **58** imports |
| **96 saved queries** from the group's own back office | **59 item types** and **106 join conditions** mapped |
| The script definitions | **209 distinct column expressions** across **825** uses, **17 item types**, **18 macros** |
| **59 spreadsheet-loading blocks** | the offset rule, confirmed: **56** take `0`, **3** take `-1` — never computed, always copied from what works |
| Business knowledge captured in conversation | **7** transactional sites with their order prefixes, **26** catalogues and their versions, the click-and-collect rule, the delivery-type values |

Two principles were applied throughout and are worth stating, because they are
what separates this from a generic code generator:

- **Copy what works, don't reinvent it.** The structural lines of an export
  script are lifted from the 34 real exports rather than written from the
  specification. The specification describes what is *allowed*; the real files
  show what actually *runs*.
- **Name the gap rather than fill it.** Where the app does not know something —
  a value, a field, a catalogue — it says so. Twice during the project this
  produced a question the business could answer in one line, which was then
  stored as permanent knowledge.

---

## The tools involved

| Tool | Role |
|---|---|
| **SAP Commerce (Hybris) / HAC** | The system the load sheets are for. The app produces files for it; it does not connect to it. |
| **Claude (Anthropic API)** | Turns a sentence into a field list, and a sentence into a query. The API key is read from the server's environment and is never written into the code. |
| **Node and TypeScript** | The server. |
| **React** | The web interface. |
| **PostgreSQL** (SQLite for local work) | Accounts, the repository, history, the audit record. Runs on both without code changes. |
| **Render** | Where it is hosted. Deploys from the repository; the database is separate, so data survives a deploy. |

---

## Numbers worth showing

| | |
|---|---|
| Real load sheet files read to build the knowledge base | **329** |
| Scripts kept in the app as working reference | **107** |
| Saved queries read for the query writer | **96** |
| Distinct column expressions the app recognises | **209** |
| Automatic checks run before any download | **41** |
| Kinds of action recorded in the audit trail | **12** |
| Automated tests, all passing | **206** in **21** files |
| Lines of code | **~13,000** |
| Manual steps to produce a checked load sheet | **1** (describe it) |
| Files the app uploads to SAP Commerce on its own | **0**, by design |

---

## What this is likely to save — and what has not been measured

**Be careful with this section.** No time-saving has been measured, and it would
be wrong to put a figure on it in a document other people will read.

What can be said factually is **which steps disappear**. Producing a load sheet
by hand means: find a comparable example among 300+ files; copy it; work out
which lines to change and which must not be touched; build the spreadsheet so
its columns line up with the script; submit it; and — if it silently did
nothing — work out why from a screen with no error on it. The app removes the
search for an example, the column-alignment work, and the convention details
that cause the silent failures, and it replaces the last step with 41 checks
that run before the file leaves the building. The saving is real and it is
concentrated in the failure case, which is the expensive one.

**Not yet established:**

- **No generated sheet has been imported into SAP Commerce yet.** The app has
  been proved against the real files — it reproduces three of the group's actual
  export scripts line for line in its test suite — but the end-to-end path
  through the admin console has not been run. Until it has, the output should be
  treated as a very well-checked draft.
- **No before-and-after timing exists.** Nobody has been timed doing the job by
  hand and then with the app. The honest way to get a figure is to time the next
  three or four real load sheets both ways; that would take an afternoon and
  would turn this section into something quotable.
- **The full SAP field list has not been loaded.** The app knows the 209 columns
  that appear in the group's real files. A query to pull the complete list of
  available fields from the system has been prepared but not yet run, which is
  the single biggest remaining improvement to how much it can recognise.

---

## Current status

Working and deployed. Six tabs — Build one, Write a query, Repository, History,
and, for administrators, Accounts and Audit. 206 automated tests pass and both
halves of the application build cleanly. The next two steps are to run one
generated sheet through the admin console end to end, and to load the full field
list.
