/**
 * The repository: every load sheet the app knows about, on two shelves.
 *
 * The first shelf is the December-21 production export - 109 scripts WOSG had
 * already written and run. The second is what has been made since, saved from
 * the app. They are kept apart because they are different kinds of thing: the
 * first is a record of what was done before the app existed and cannot be
 * regenerated (the extraction captured each script's header line, its CSV
 * parameters and the CSV's heading row - never the file itself), while a saved
 * sheet carries the request that made it and so can be opened, changed and
 * downloaded again.
 *
 * One store underneath, because they are the same knowledge: the library the
 * generator reads. Saving a sheet puts it on the shelf; saying it imported
 * cleanly is what additionally makes it evidence the catalogue trusts.
 */

import type { Db } from '../db/index.js';
import type { LibraryTemplate, SavedSheetRequest } from '../../shared/library.js';
import { formatColumn } from '../../shared/impex.js';
import { slugForFiles } from '../domain/generate.js';
import { getTemplate, loadLibrary, saveTemplate, deleteTemplate } from './libraryService.js';
import { generateFromRequest, type SheetRequest } from './sheetService.js';

export type Shelf = 'supplied' | 'saved';

export interface RepositoryEntry {
  id: string;
  shelf: Shelf;
  name: string;
  /** Where it came from: the folder in the export, or who saved it and when. */
  provenance: string;
  group: string;
  direction: string;
  itemTypes: string[];
  /** The attribute names it writes, for searching and for the card. */
  fields: string[];
  columnCount: number;
  csvFile: string | null;
  columnsOffset: number | null;
  verified: boolean;
  description?: string;
  /** True when the entry can be opened in the picker and downloaded again. */
  reusable: boolean;
  updatedAt: string;
}

export function shelfOf(template: LibraryTemplate): Shelf {
  return template.origin === 'seed' ? 'supplied' : 'saved';
}

function provenanceOf(template: LibraryTemplate): string {
  if (template.origin === 'seed') return template.sourcePath;
  const when = template.createdAt.slice(0, 10);
  return template.savedBy ? `Saved by ${template.savedBy} on ${when}` : `Saved on ${when}`;
}

export function toEntry(template: LibraryTemplate): RepositoryEntry {
  const block = template.blocks[0];
  return {
    id: template.id,
    shelf: shelfOf(template),
    name: template.name,
    provenance: provenanceOf(template),
    group: template.group,
    direction: template.direction,
    itemTypes: [...new Set(template.blocks.map((b) => b.itemType))],
    fields: [
      ...new Set(
        template.blocks.flatMap((b) => b.columns.filter((c) => c.kind === 'attribute').map((c) => c.name)),
      ),
    ],
    columnCount: template.blocks.reduce((total, b) => total + b.columns.length, 0),
    csvFile: block?.csv?.file ?? null,
    columnsOffset: block?.csv?.columnsOffset ?? null,
    verified: template.verified,
    ...(template.description ? { description: template.description } : {}),
    reusable: template.savedRequest !== undefined,
    updatedAt: template.updatedAt,
  };
}

export interface RepositoryQuery {
  search?: string;
  itemType?: string;
  direction?: string;
  shelf?: Shelf;
}

function matches(entry: RepositoryEntry, query: RepositoryQuery): boolean {
  if (query.shelf && entry.shelf !== query.shelf) return false;
  if (query.direction && entry.direction !== query.direction) return false;
  if (query.itemType && !entry.itemTypes.some((type) => type.toLowerCase() === query.itemType!.toLowerCase())) {
    return false;
  }
  const term = query.search?.trim().toLowerCase();
  if (!term) return true;
  // Searched by what somebody would remember about it: its name, its folder,
  // the fields it writes, or the CSV it was paired with.
  return [entry.name, entry.provenance, entry.description ?? '', entry.csvFile ?? '', ...entry.fields, ...entry.itemTypes]
    .join(' ')
    .toLowerCase()
    .includes(term);
}

export interface RepositoryListing {
  supplied: RepositoryEntry[];
  saved: RepositoryEntry[];
  /** Totals before the search was applied, so the counts do not jump about. */
  totals: { supplied: number; saved: number };
}

export async function listRepository(db: Db, query: RepositoryQuery = {}): Promise<RepositoryListing> {
  const { all } = await loadLibrary(db);
  const entries = all.map(toEntry);
  const found = entries.filter((entry) => matches(entry, query));
  return {
    supplied: found.filter((entry) => entry.shelf === 'supplied').sort((a, b) => a.name.localeCompare(b.name)),
    saved: found.filter((entry) => entry.shelf === 'saved').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    totals: {
      supplied: entries.filter((entry) => entry.shelf === 'supplied').length,
      saved: entries.filter((entry) => entry.shelf === 'saved').length,
    },
  };
}

export interface RepositoryDetail {
  entry: RepositoryEntry;
  /** The header blocks as the record holds them, for reading. */
  blocks: {
    op: string;
    itemType: string;
    headerLine: string;
    columns: { expression: string; label: string | null }[];
    csvHeaderRow: string[] | null;
    csv: { file: string; encoding: string; delimiter: string; linesToSkip: number; columnsOffset: number } | null;
  }[];
  macros: [string, string][];
  notes?: string;
  /** What was asked for, on a saved sheet - what "open it again" reuses. */
  request: SavedSheetRequest | null;
}

export async function repositoryDetail(db: Db, id: string): Promise<RepositoryDetail | undefined> {
  const template = await getTemplate(db, id);
  if (!template) return undefined;
  return {
    entry: toEntry(template),
    blocks: template.blocks.map((block) => ({
      op: block.op,
      itemType: block.itemType,
      headerLine: `${block.op} ${block.itemType};${block.columns.map(formatColumn).join(';')}`,
      columns: block.columns.map((column, index) => ({
        expression: column.raw ?? formatColumn(column),
        label: block.csvLabels?.[index] ?? null,
      })),
      csvHeaderRow: block.csvHeaderRow ?? null,
      csv: block.csv ?? null,
    })),
    macros: Object.entries(template.macros),
    ...(template.notes ? { notes: template.notes } : {}),
    request: template.savedRequest ?? null,
  };
}

export interface SaveInput {
  request: SheetRequest;
  name?: string;
  description?: string;
  /**
   * The user says this one imported cleanly. That is what makes it evidence:
   * only then does it join the catalogue, and only then does an attribute it
   * carries stop being flagged as unverified.
   */
  imported?: boolean;
  savedBy?: string;
}

export interface SaveResult {
  entry: RepositoryEntry;
  /** Attributes that were unverified and are now known, when it was saved as imported. */
  learned: string[];
}

/** A saved sheet gets its own id rather than overwriting one saved earlier. */
async function freeId(db: Db, base: string): Promise<string> {
  if (!(await getTemplate(db, base))) return base;
  for (let suffix = 2; suffix < 500; suffix++) {
    const candidate = `${base}-${suffix}`;
    if (!(await getTemplate(db, candidate))) return candidate;
  }
  return `${base}-${Date.now()}`;
}

export async function saveToRepository(db: Db, input: SaveInput): Promise<SaveResult> {
  const sheet = await generateFromRequest(db, input.request);
  const before = (await loadLibrary(db)).catalogue;
  const unverified = sheet.resolved.blocks
    .flatMap((block) => block.columns)
    .filter((column) => column.status === 'unverified')
    .map((column) => column.column.name);

  const now = new Date().toISOString();
  const name = (input.name?.trim() || input.request.name).slice(0, 120);
  const slug = slugForFiles(name);
  const id = await freeId(db, `saved-${slug.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()}`);
  // The confirmation tick was a decision about one download, not part of the sheet.
  const { confirmedUnverified: _ignored, ...request } = input.request;

  const template: LibraryTemplate = {
    id,
    name,
    sourcePath: `saved/${slug}.impex`,
    group: 'Saved in the app',
    direction: sheet.resolved.direction,
    dataSource: sheet.csvs.length > 0 ? 'externalCsv' : 'inline',
    blocks: sheet.resolved.blocks.map((block) => ({
      op: block.op,
      itemType: block.itemType,
      columns: block.columns.map((column) => column.column),
      ...(block.csv
        ? {
            csv: {
              file: block.csv.file,
              encoding: block.csv.encoding,
              delimiter: block.csv.delimiter,
              linesToSkip: block.csv.linesToSkip,
              columnsOffset: block.csv.columnsOffset,
            },
            layout: block.csv.layout,
            csvHeaderRow: block.csv.headerRow,
            csvLabels: block.columns.map((column) => column.label),
          }
        : {}),
    })),
    macros: Object.fromEntries(sheet.resolved.macros),
    origin: 'user',
    verified: input.imported === true,
    notes: input.imported
      ? `Generated by this app and confirmed as imported cleanly on ${now.slice(0, 10)}.`
      : `Saved from the app on ${now.slice(0, 10)}. Not yet confirmed as imported.`,
    ...(input.description?.trim() ? { description: input.description.trim() } : {}),
    ...(input.savedBy ? { savedBy: input.savedBy } : {}),
    savedRequest: request as SavedSheetRequest,
    createdAt: now,
    updatedAt: now,
  };

  await saveTemplate(db, template);

  const after = (await loadLibrary(db)).catalogue;
  const learned = unverified.filter(
    (attribute) =>
      after.find(request.itemType, attribute) !== undefined && before.find(request.itemType, attribute) === undefined,
  );

  return { entry: toEntry(template), learned };
}

export class NotRemovableError extends Error {}

/**
 * Removing a saved sheet. The supplied export is not removable: it is the
 * shipped reference the whole app reads, and an empty library re-seeds itself
 * on the next boot anyway, so deleting one would only look like it worked.
 */
export async function removeFromRepository(db: Db, id: string): Promise<void> {
  const template = await getTemplate(db, id);
  if (!template) throw new NotRemovableError('No such load sheet in the repository.');
  if (template.origin === 'seed') {
    throw new NotRemovableError(
      'This came from the supplied production export, which is the reference the app reads. It cannot be removed.',
    );
  }
  await deleteTemplate(db, id);
}
