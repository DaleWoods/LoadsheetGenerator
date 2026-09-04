import { describe, expect, it } from 'vitest';
import { buildCatalogue } from './catalogue.js';
import { composeSpec } from './compose.js';
import { generateLoadSheet } from './generate.js';
import { readScript, validate } from './validate.js';
import { normaliseSeed } from '../library/seedTemplates.js';
import { readSeedFile } from '../library/seedLibrary.js';
import type { LoadSheetSpec } from '../../shared/spec.js';

const templates = normaliseSeed(readSeedFile());
const catalogue = buildCatalogue(templates);
const context = { templates, catalogue };
const at = { generatedAt: '2026-09-04' };

function flagSpec(rows: string[][]): LoadSheetSpec {
  return composeSpec(
    { name: 'Use Png Image Format', itemType: 'Product', fields: [{ name: 'usePngImageFormat' }], rows },
    context,
  );
}

describe('reading a generated script back', () => {
  it('finds the header line and the include call that belongs to it', () => {
    const out = generateLoadSheet(flagSpec([]), context, at);
    const blocks = readScript(out.impex.content);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      op: 'INSERT_UPDATE',
      itemType: 'Product',
      include: { file: 'UsePngImageFormat.csv', encoding: 'UTF-8', delimiter: ',', linesToSkip: 1, columnsOffset: 0 },
    });
    expect(blocks[0]!.columns).toEqual(['code[unique=true]', 'usePngImageFormat[default=False]', '$catalogVersion']);
  });
});

describe('the checks that stop a broken zip', () => {
  it('catches an offset that does not match the CSV that was written', () => {
    // The See More Styles bug, staged deliberately: a CSV with the leading
    // blank type column, and an offset of -1 copied from somewhere it did not
    // belong. Every value would land one column left and SAP would report
    // "unknown type" on the first row.
    const spec = flagSpec([['17331268', 'TRUE']]);
    spec.blocks[0]!.csv!.columnsOffset = -1;
    const out = generateLoadSheet(spec, context, at);
    const offset = out.findings.find((f) => f.code === 'csv.offsetLayout')!;
    expect(offset.severity).toBe('error');
    expect(offset.message).toContain('unknown type');
    expect(out.packageable).toBe(false);
  });

  it('catches a CSV with the wrong number of columns', () => {
    const spec = flagSpec([['17331268', 'TRUE']]);
    const out = generateLoadSheet(spec, context, at);
    // Same script, a CSV a column short - as if it had been edited after generation.
    const damaged = {
      ...out,
      csvs: [{ ...out.csvs[0]!, content: 'Type (Leave Blank),SKU,Use Png Image Format\r\n,17331268,TRUE\r\n' }],
    };
    const findings = validate({ resolved: out.resolved, impex: out.impex, csvs: damaged.csvs });
    expect(findings.find((f) => f.code === 'csv.columnCount')).toMatchObject({
      severity: 'error',
      message: expect.stringContaining('has 3 columns'),
    });
  });

  it('catches headings that no longer line up with the header line', () => {
    const out = generateLoadSheet(flagSpec([]), context, at);
    const swapped = out.csvs[0]!.content.replace(
      'Type (Leave Blank),SKU,Use Png Image Format [default=False],Catalogue Version (Leave Blank)',
      'Type (Leave Blank),Use Png Image Format [default=False],SKU,Catalogue Version (Leave Blank)',
    );
    const findings = validate({
      resolved: out.resolved,
      impex: out.impex,
      csvs: [{ ...out.csvs[0]!, content: swapped }],
    });
    expect(findings.filter((f) => f.code === 'csv.headerOrder')).toHaveLength(2);
  });

  it('refuses a value that is not TRUE or FALSE in a flag the library declares', () => {
    const out = generateLoadSheet(flagSpec([['17331268', 'Y']]), context, at);
    expect(out.findings.find((f) => f.code === 'csv.booleanValue')).toMatchObject({ severity: 'error', row: 2 });
    expect(out.packageable).toBe(false);
  });

  it('only warns on a flag the library infers rather than declares', () => {
    // isSpecialOrder never carries [default=...]; the library infers it is a
    // flag from the sheets it appears in. That is not enough to block a zip.
    const out = generateLoadSheet(
      composeSpec(
        { name: 'Is Special Order', itemType: 'Product', fields: [{ name: 'isSpecialOrder' }], rows: [['17331268', 'Y']] },
        context,
      ),
      context,
      at,
    );
    const finding = out.findings.find((f) => f.code === 'csv.booleanValue')!;
    expect(finding.severity).toBe('warning');
    expect(finding.message).toContain('only infers');
    expect(out.packageable).toBe(true);
  });

  it('catches a row with no key, and a row of the wrong width', () => {
    const out = generateLoadSheet(flagSpec([['', 'TRUE']]), context, at);
    expect(out.findings.find((f) => f.code === 'csv.keyEmpty')).toMatchObject({ severity: 'error', row: 2 });

    const short = validate({
      resolved: out.resolved,
      impex: out.impex,
      csvs: [{ ...out.csvs[0]!, content: `${out.csvs[0]!.content.split('\r\n')[0]}\r\n,17331268\r\n` }],
    });
    expect(short.find((f) => f.code === 'csv.rowWidth')).toMatchObject({ severity: 'error' });
  });

  it('catches the same field ticked twice', () => {
    const out = generateLoadSheet(
      composeSpec(
        { name: 'Twice', itemType: 'Product', fields: [{ name: 'metaKeywords' }, { name: 'metaKeywords' }] },
        context,
      ),
      context,
      at,
    );
    expect(out.findings.find((f) => f.code === 'columns.duplicate')?.severity).toBe('error');
  });

  it('catches a macro used in a column but never declared', () => {
    const spec = flagSpec([]);
    spec.blocks[0]!.columns.push({ kind: 'macro', name: '$approved' });
    const out = generateLoadSheet(spec, context, at);
    // $approved resolves from the library, so this one is legitimate and declared.
    expect(out.findings.find((f) => f.code === 'macro.undeclared')).toBeUndefined();
    expect(out.impex.content).toContain("$approved=approvalstatus(code)[default='unapproved']");

    const unknown = flagSpec([]);
    unknown.blocks[0]!.columns.push({ kind: 'macro', name: '$notAMacro' });
    expect(generateLoadSheet(unknown, context, at).findings.find((f) => f.code === 'macro.undeclared')).toMatchObject({
      severity: 'error',
    });
  });

  it('says when it had nothing close to copy the offset from', () => {
    const out = generateLoadSheet(
      composeSpec({ name: 'Editors Pick', itemType: 'Product', fields: [{ name: 'isEditorsPick' }] }, context),
      context,
      at,
    );
    expect(out.findings.find((f) => f.code === 'csv.offsetDefault')).toMatchObject({ severity: 'info' });
  });
});
