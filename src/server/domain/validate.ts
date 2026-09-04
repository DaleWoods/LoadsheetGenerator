/**
 * Checking a load sheet before it is packaged.
 *
 * The checks run against the files as written, not against the model they were
 * written from: the .impex is re-read for its header lines and its
 * `includeExternalDataMedia` calls, and each CSV for its header row. A
 * generator bug and a bad specification then both surface the same way, which
 * is the only version of this worth having - the failure this replaces is an
 * import that dies in HAC an hour after somebody hit upload (§6.4).
 */

import { normaliseBoolean } from '../../shared/fieldTypes.js';
import { parseCsv } from '../../shared/csv.js';
import type { ResolvedLoadSheet } from './resolve.js';

export type Severity = 'error' | 'warning' | 'info';

export interface Finding {
  severity: Severity;
  /** Stable identifier, so the UI can style a class of problem consistently. */
  code: string;
  message: string;
  /** Where it is, when that is known: block index, column index, CSV row number. */
  block?: number;
  column?: number;
  row?: number;
}

export interface GeneratedFile {
  filename: string;
  content: string;
}

export interface ValidationInput {
  resolved: ResolvedLoadSheet;
  impex: GeneratedFile;
  csvs: GeneratedFile[];
}

const HEADER_LINE = /^(INSERT_UPDATE|INSERT|UPDATE|REMOVE)\s+(\w+)\s*;(.*)$/;
const INCLUDE_CALL =
  /impex\.includeExternalDataMedia\(\s*""(.+?)""\s*,\s*""(.+?)""\s*,\s*'(.+?)'\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*\)/;

interface ScriptBlock {
  op: string;
  itemType: string;
  columns: string[];
  include?: { file: string; encoding: string; delimiter: string; linesToSkip: number; columnsOffset: number };
}

/** Read back the generated script the way SAP Commerce will: header lines and include calls. */
export function readScript(impex: string): ScriptBlock[] {
  const blocks: ScriptBlock[] = [];
  for (const line of impex.split(/\r?\n/)) {
    const header = HEADER_LINE.exec(line.trim());
    if (header) {
      blocks.push({
        op: header[1]!,
        itemType: header[2]!,
        columns: header[3]!.split(';').map((c) => c.trim()),
      });
      continue;
    }
    const include = INCLUDE_CALL.exec(line);
    if (include && blocks.length > 0) {
      blocks[blocks.length - 1]!.include = {
        file: include[1]!,
        encoding: include[2]!,
        delimiter: include[3]!,
        linesToSkip: Number(include[4]),
        columnsOffset: Number(include[5]),
      };
    }
  }
  return blocks;
}

export function validate(input: ValidationInput): Finding[] {
  const findings: Finding[] = [];
  const add = (finding: Finding): void => {
    findings.push(finding);
  };
  const script = readScript(input.impex.content);

  if (script.length !== input.resolved.blocks.length) {
    add({
      severity: 'error',
      code: 'script.blockCount',
      message: `The script has ${script.length} header block(s) but ${input.resolved.blocks.length} were specified.`,
    });
  }

  const declaredMacros = new Set(input.resolved.macros.map(([name]) => name));

  input.resolved.blocks.forEach((block, blockIndex) => {
    const written = script[blockIndex];

    if (block.columns.length === 0) {
      add({ severity: 'error', code: 'columns.empty', message: `${block.itemType}: no columns were selected.`, block: blockIndex });
    }

    if (input.resolved.direction === 'import' && !block.columns.some((c) => c.unique)) {
      add({
        severity: 'warning',
        code: 'key.missing',
        message: `${block.itemType}: no column is marked unique, so ImpEx has no key to match rows on.`,
        block: blockIndex,
      });
    }

    const seen = new Map<string, number>();
    block.columns.forEach((column, columnIndex) => {
      const previous = seen.get(column.expression);
      if (previous !== undefined) {
        add({
          severity: 'error',
          code: 'columns.duplicate',
          message: `${block.itemType}: ${column.expression} appears twice (columns ${previous + 1} and ${columnIndex + 1}).`,
          block: blockIndex,
          column: columnIndex,
        });
      }
      seen.set(column.expression, columnIndex);

      if (column.status === 'unverified') {
        const hint = column.suggestions?.length
          ? ` Did you mean ${column.suggestions.map((s) => `\`${s}\``).join(' or ')}?`
          : '';
        add({
          severity: 'warning',
          code: 'column.unverified',
          message: `${column.source.name} is not in the load sheet library for ${block.itemType}. It has been generated and marked unverified - check it exists in SAP Commerce before importing.${hint}`,
          block: blockIndex,
          column: columnIndex,
        });
      }

      for (const macro of column.expression.matchAll(/\$([A-Za-z_][A-Za-z0-9_]*)/g)) {
        if (!declaredMacros.has(macro[1]!)) {
          add({
            severity: 'error',
            code: 'macro.undeclared',
            message: `${block.itemType}: column ${columnIndex + 1} uses $${macro[1]} but the script does not declare it.`,
            block: blockIndex,
            column: columnIndex,
          });
        }
      }
    });

    // Duplicate headings are legal but make a CSV very hard to fill in by hand.
    const labels = new Map<string, number>();
    block.columns.forEach((column, columnIndex) => {
      const key = column.label.toLowerCase();
      if (labels.has(key)) {
        add({
          severity: 'warning',
          code: 'csv.duplicateLabel',
          message: `Two columns are both headed "${column.label}" - columns ${labels.get(key)! + 1} and ${columnIndex + 1}.`,
          block: blockIndex,
          column: columnIndex,
        });
      }
      labels.set(key, columnIndex);
    });

    if (written && written.columns.length !== block.columns.length) {
      add({
        severity: 'error',
        code: 'script.columnCount',
        message: `${block.itemType}: the header line was written with ${written.columns.length} columns but ${block.columns.length} were specified.`,
        block: blockIndex,
      });
    }

    if (!block.csv) return;
    validateCsvBlock(input, block, blockIndex, written, add);
  });

  return findings;
}

function validateCsvBlock(
  input: ValidationInput,
  block: ResolvedLoadSheet['blocks'][number],
  blockIndex: number,
  written: ScriptBlock | undefined,
  add: (finding: Finding) => void,
): void {
  const csv = block.csv!;
  const file = input.csvs.find((f) => f.filename === csv.file);
  if (!file) {
    add({
      severity: 'error',
      code: 'csv.missing',
      message: `The script reads ${csv.file} but no such file was generated.`,
      block: blockIndex,
    });
    return;
  }

  const include = written?.include;
  if (!include) {
    add({
      severity: 'error',
      code: 'csv.includeMissing',
      message: `${block.itemType}: the block reads a CSV but the script has no includeExternalDataMedia call for it.`,
      block: blockIndex,
    });
  }

  // The check that matters. A CSV whose leading type column is present is read
  // at offset 0; one without it at -1. Cross-check the value that was written
  // against the file that was written, because copying the offset from a
  // library template is only safe if the layout came from the same place.
  const layoutOffset = csv.layout.typeColumn ? 0 : -1;
  if (csv.columnsOffset !== layoutOffset) {
    add({
      severity: 'error',
      code: 'csv.offsetLayout',
      message:
        `columnsOffset is ${csv.columnsOffset} but ${csv.file} ${csv.layout.typeColumn ? 'has' : 'has no'} a leading type column, ` +
        `which needs ${layoutOffset}. This mismatch is what causes "unknown type" errors on import.`,
      block: blockIndex,
    });
  }
  if (include && include.columnsOffset !== csv.columnsOffset) {
    add({
      severity: 'error',
      code: 'csv.offsetWritten',
      message: `The include call was written with columnsOffset ${include.columnsOffset} but the CSV was laid out for ${csv.columnsOffset}.`,
      block: blockIndex,
    });
  }
  if (!csv.columnsOffsetFrom) {
    add({
      severity: 'info',
      code: 'csv.offsetDefault',
      message: `No library template matched closely enough to copy columnsOffset from, so the house convention (leading blank type column, offset 0) was used.`,
      block: blockIndex,
    });
  }

  const rows = parseCsv(file.content, csv.delimiter);
  const headerRow = rows[0] ?? [];
  const impexColumnCount = written?.columns.length ?? block.columns.length;
  // A row's first cell is the item type, which the header line does not list;
  // with no type column the offset takes it back off again.
  const expectedColumns = impexColumnCount + 1 + csv.columnsOffset;
  if (headerRow.length !== expectedColumns) {
    add({
      severity: 'error',
      code: 'csv.columnCount',
      message: `${csv.file} has ${headerRow.length} columns; the header line and columnsOffset=${csv.columnsOffset} expect ${expectedColumns}.`,
      block: blockIndex,
    });
  }

  const dataOffset = csv.layout.typeColumn ? 1 : 0;
  block.columns.forEach((column, columnIndex) => {
    const label = headerRow[columnIndex + dataOffset];
    if (label !== undefined && label !== column.label) {
      add({
        severity: 'error',
        code: 'csv.headerOrder',
        message: `${csv.file} column ${columnIndex + dataOffset + 1} is headed "${label}" but the header line has ${column.expression} there ("${column.label}").`,
        block: blockIndex,
        column: columnIndex,
      });
    }
  });

  rows.slice(1).forEach((row, index) => {
    const rowNumber = index + 2;
    if (row.length !== headerRow.length) {
      add({
        severity: 'error',
        code: 'csv.rowWidth',
        message: `${csv.file} row ${rowNumber} has ${row.length} cells; the header row has ${headerRow.length}.`,
        block: blockIndex,
        row: rowNumber,
      });
      return;
    }
    block.columns.forEach((column, columnIndex) => {
      const value = row[columnIndex + dataOffset] ?? '';
      if (column.unique && value.trim() === '') {
        add({
          severity: 'error',
          code: 'csv.keyEmpty',
          message: `${csv.file} row ${rowNumber} has no value in "${column.label}", which is the key ImpEx matches on.`,
          block: blockIndex,
          column: columnIndex,
          row: rowNumber,
        });
      }
      // A value in a column WOSG heads "(Leave Blank)" is almost always a row
      // that has slipped a column, which is the failure this app exists to
      // stop. Not an error - the column may legitimately be filled in - but
      // worth a look before uploading.
      if (/leave blank/i.test(column.label) && value.trim() !== '') {
        add({
          severity: 'warning',
          code: 'csv.blankColumnValue',
          message: `${csv.file} row ${rowNumber} has ${JSON.stringify(value)} in "${column.label}", which is normally left empty. Check the row has not slipped a column.`,
          block: blockIndex,
          column: columnIndex,
          row: rowNumber,
        });
      }
      if (column.shape.type === 'boolean' && normaliseBoolean(value) === null) {
        add({
          severity: column.boolean === 'declared' ? 'error' : 'warning',
          code: 'csv.booleanValue',
          message:
            `${csv.file} row ${rowNumber}, "${column.label}": ${JSON.stringify(value)} is not TRUE or FALSE.` +
            (column.boolean === 'observed'
              ? ' The library only infers this field is a flag, so check it before importing.'
              : ''),
          block: blockIndex,
          column: columnIndex,
          row: rowNumber,
        });
      }
    });
  });
}

export function hasErrors(findings: Finding[]): boolean {
  return findings.some((f) => f.severity === 'error');
}
