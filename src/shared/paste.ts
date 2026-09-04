/**
 * Taking rows a user pasted in and lining them up with the columns they picked.
 *
 * People paste out of Excel, which means tabs rather than commas, usually a
 * header row, and often the leading "Type (Leave Blank)" column because they
 * copied a whole sheet. Guessing wrong here would shift every value one column
 * left - the same failure as a wrong `columnsOffset`, arrived at from the other
 * end - so each adjustment is reported back and shown to the user rather than
 * being applied silently (§6.2).
 */

import { parseCsv } from './csv.js';

export interface AlignedRows {
  rows: string[][];
  /** What was done to the paste, in words, for the screen. */
  notes: string[];
  /** Rows whose width does not match the columns; kept, and reported by the validator. */
  ragged: number;
}

function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const tabs = (firstLine.match(/\t/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;
  const semicolons = (firstLine.match(/;/g) ?? []).length;
  if (tabs >= commas && tabs >= semicolons && tabs > 0) return '\t';
  if (semicolons > commas) return ';';
  return ',';
}

function normalise(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * A row that repeats the column headings rather than holding data.
 *
 * Matching is loose on purpose. The headings somebody pastes came from the CSV
 * they were sent, and WOSG's own headings vary around the same field - "Home
 * Delivery Available on site" against "Home Delivery Available on site -
 * Append". Requiring them to match exactly means the heading row is loaded as
 * data, and a row of column names is a row SAP will try to import.
 */
function looksLikeHeaderRow(row: string[], labels: string[]): boolean {
  const cells = row.map(normalise).filter((c) => c !== '');
  if (cells.length === 0) return false;
  const known = labels.map(normalise).filter((label) => label !== '');
  const matched = cells.filter((cell) =>
    known.some((label) => cell === label || cell.startsWith(label) || label.startsWith(cell)),
  ).length;
  return matched >= Math.max(1, Math.ceil(cells.length / 2));
}

export function alignPastedRows(text: string, labels: string[]): AlignedRows {
  const notes: string[] = [];
  const delimiter = detectDelimiter(text);
  if (delimiter === '\t') notes.push('Read as tab-separated, the way Excel pastes.');

  // Only the newlines around the paste come off. Trimming whitespace would eat
  // a leading empty cell - which is exactly what a sheet copied with its blank
  // type column starts with - and shift that row one column left on its own.
  const trimmed = text.replace(/^[\r\n]+/, '').replace(/[\r\n]+$/, '');
  let rows = parseCsv(trimmed, delimiter).filter((row) => row.some((cell) => cell.trim() !== ''));
  if (rows.length === 0) return { rows: [], notes, ragged: 0 };

  if (looksLikeHeaderRow(rows[0]!, labels)) {
    rows = rows.slice(1);
    notes.push('Dropped the pasted heading row.');
  }

  // A paste one column too wide whose first cell is empty on every row is a
  // sheet copied with its leading type column. The app writes that column
  // itself, so it comes off here.
  const tooWide = rows.every((row) => row.length === labels.length + 1);
  if (tooWide && rows.every((row) => (row[0] ?? '').trim() === '')) {
    rows = rows.map((row) => row.slice(1));
    notes.push('Dropped the leading blank type column - the app writes that itself.');
  }

  const ragged = rows.filter((row) => row.length !== labels.length).length;
  return { rows, notes, ragged };
}
