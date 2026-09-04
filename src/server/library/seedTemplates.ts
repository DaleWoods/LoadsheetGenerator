/**
 * Turning the December-21 production export into library records.
 *
 * `loadsheet-extraction-raw.json` is the machine-readable extraction of 109
 * real scripts: every header line, every `includeExternalDataMedia` call with
 * its exact parameters, the matched CSV header row, and the macros each script
 * declared. This module reads it as data -- nothing here is retyped from the
 * digest -- and normalises it into `LibraryTemplate`s.
 */

import { parseColumn } from '../../shared/impex.js';
import type {
  CsvLayout,
  Direction,
  ExternalCsvCall,
  HeaderBlock,
  ImpexOperation,
  LibraryTemplate,
} from '../../shared/library.js';

export interface RawHeader {
  op: string;
  itemType: string;
  columns: string[];
}

export interface RawCsvCall {
  csvFile: string;
  encoding: string;
  delimiter: string;
  linesToSkip: number;
  columnOffset: number;
}

export interface RawTemplate {
  relPath: string;
  headers: RawHeader[];
  externalCsvCalls: RawCsvCall[];
  csvHeaderRows: Record<string, string[]>;
  macros: Record<string, string>;
}

/**
 * The leading column of a WOSG CSV holds each row's item type and is normally
 * left empty so the header line's type applies. Usually headed "Type (Leave
 * Blank)"; the variant product sheets head it "Variant Type" and do fill it in.
 * Its presence is what `columnsOffset` records.
 */
const TYPE_COLUMN_LABEL = /^\s*(?:\w+\s+)?type\b|leave blank/i;

const DEFAULT_TYPE_COLUMN_LABEL = 'Type (Leave Blank)';

/** Some captured CSV headers came through with lost characters; an en-dash reads better than U+FFFD. */
function tidyLabel(label: string): string {
  return label.replace(/�/g, '-').replace(/\s+/g, ' ').trim();
}

export function templateId(relPath: string): string {
  return relPath
    .replace(/\.[^./]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function templateName(relPath: string): string {
  const parts = relPath.replace(/\.[^./]+$/, '').split('/');
  // "importScript" and friends name the file, not the load sheet; the folder does.
  const last = parts[parts.length - 1] ?? '';
  const meaningful = /^(import|export)?script$/i.test(last) && parts.length > 1 ? parts.slice(0, -1) : parts;
  return meaningful.join(' / ');
}

function normaliseOp(op: string): ImpexOperation {
  const upper = op.trim().toUpperCase();
  return upper === 'INSERT' || upper === 'UPDATE' || upper === 'REMOVE' || upper === 'INSERT_UPDATE'
    ? (upper as ImpexOperation)
    : 'INSERT_UPDATE';
}

/**
 * Import or export.
 *
 * The folder says so in every case in the seed set. The column shape backs it
 * up -- export scripts lead with `$catalogVersion` and label columns with
 * `[alias=...]` for the person reading the CSV that comes out -- and is used
 * where the path is silent.
 */
export function detectDirection(relPath: string, headers: RawHeader[]): Direction {
  if (/(^|\/)exports?(\/|$)|export[^/]*\.(impex|txt)$|export/i.test(relPath)) return 'export';
  const columns = headers.flatMap((h) => h.columns);
  const aliased = columns.filter((c) => /\[alias=/i.test(c)).length;
  if (aliased > 0 && aliased >= columns.length / 2) return 'export';
  return 'import';
}

function detectLayout(headerRow: string[] | undefined): CsvLayout {
  const first = headerRow?.[0];
  if (first !== undefined && TYPE_COLUMN_LABEL.test(first)) {
    return { typeColumn: true, typeColumnLabel: tidyLabel(first) };
  }
  return { typeColumn: false, typeColumnLabel: DEFAULT_TYPE_COLUMN_LABEL };
}

/**
 * Line the CSV's own header row up against the header line's columns.
 *
 * Where they line up, the labels are WOSG's wording for those attributes --
 * "Show Price On Site", not `priceVisibleOnSite` -- which is what the generator
 * writes into a new CSV. Where they do not, the labels are dropped rather than
 * guessed: several folders in the export are shared scratch space where the CSV
 * sitting next to a script is not the CSV it was last paired with, and a label
 * taken from the wrong column is worse than no label.
 */
function alignLabels(columns: string[], headerRow: string[] | undefined, layout: CsvLayout): (string | null)[] | undefined {
  if (!headerRow) return undefined;
  const offset = layout.typeColumn ? 1 : 0;
  const available = headerRow.length - offset;
  // Trailing columns with a default may legitimately be left out of the CSV.
  const droppable = countTrailingDefaulted(columns);
  if (available > columns.length || available < columns.length - droppable) return undefined;
  return columns.map((_, index) => {
    const label = headerRow[index + offset];
    return label === undefined ? null : tidyLabel(label);
  });
}

/** How many columns at the end of a header line could be omitted from the CSV without loss. */
export function countTrailingDefaulted(columns: string[]): number {
  let count = 0;
  for (let i = columns.length - 1; i >= 0; i--) {
    const column = columns[i]!;
    if (column.trim().startsWith('$') || /\bdefault=/i.test(column)) count++;
    else break;
  }
  return count;
}

function toCsvCall(raw: RawCsvCall): ExternalCsvCall {
  return {
    file: raw.csvFile,
    encoding: raw.encoding,
    delimiter: raw.delimiter,
    linesToSkip: raw.linesToSkip,
    columnsOffset: raw.columnOffset,
  };
}

export function normaliseTemplate(raw: RawTemplate, now: string): LibraryTemplate {
  const blocks: HeaderBlock[] = raw.headers.map((header, index) => {
    // A script with several blocks makes one include call per block that reads a
    // CSV, in the same order (the combined facet types+values script is the case
    // in the set); a block past the end of that list reads no CSV.
    const call = raw.externalCsvCalls[index];
    const headerRow = call ? raw.csvHeaderRows[call.csvFile] : undefined;
    const layout = detectLayout(headerRow);
    const labels = call ? alignLabels(header.columns, headerRow, layout) : undefined;
    return {
      op: normaliseOp(header.op),
      itemType: header.itemType,
      columns: header.columns.map(parseColumn),
      ...(call ? { csv: toCsvCall(call), layout } : {}),
      ...(headerRow ? { csvHeaderRow: headerRow.map(tidyLabel) } : {}),
      ...(labels ? { csvLabels: labels } : {}),
    };
  });

  return {
    id: templateId(raw.relPath),
    name: templateName(raw.relPath),
    sourcePath: raw.relPath,
    group: raw.relPath.split('/')[0] ?? 'Other',
    direction: detectDirection(raw.relPath, raw.headers),
    dataSource: raw.externalCsvCalls.length > 0 ? 'externalCsv' : 'inline',
    blocks,
    macros: raw.macros,
    origin: 'seed',
    verified: true,
    createdAt: now,
    updatedAt: now,
  };
}

export function normaliseSeed(rawTemplates: RawTemplate[], now = new Date().toISOString()): LibraryTemplate[] {
  return rawTemplates.map((raw) => normaliseTemplate(raw, now));
}
