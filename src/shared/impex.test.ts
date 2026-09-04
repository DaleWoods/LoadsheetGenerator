import { describe, expect, it } from 'vitest';
import { formatColumn, isUnique, parseColumn, requiredMacros } from './impex.js';
import { readSeedFile } from '../server/library/seedLibrary.js';

describe('parseColumn', () => {
  it('reads a plain attribute', () => {
    expect(parseColumn('manufacturerName')).toMatchObject({ kind: 'attribute', name: 'manufacturerName', modifiers: [] });
  });

  it('reads the unique key', () => {
    const column = parseColumn('code[unique=true]');
    expect(column.modifiers).toEqual([{ name: 'unique', value: 'true' }]);
    expect(isUnique(column)).toBe(true);
  });

  it('separates a reference qualifier from its modifiers', () => {
    const column = parseColumn("seeMoreStylesRef(code, $catalogVersion)[mode=append,collection-delimiter='|']");
    expect(column.name).toBe('seeMoreStylesRef');
    expect(column.qualifier).toBe('code, $catalogVersion');
    expect(column.modifiers).toEqual([
      { name: 'mode', value: 'append' },
      { name: 'collection-delimiter', value: "'|'" },
    ]);
  });

  it('keeps brackets inside a qualifier out of the modifier list', () => {
    const column = parseColumn('paymentInfo(V12PaymentInfo.plan(name[lang=$lang])|blankValue[virtual=true,default=""])[alias=Plan]');
    expect(column.name).toBe('paymentInfo');
    expect(column.qualifier).toBe('V12PaymentInfo.plan(name[lang=$lang])|blankValue[virtual=true,default=""]');
    expect(column.modifiers).toEqual([{ name: 'alias', value: 'Plan' }]);
  });

  it('collects modifiers written as several groups', () => {
    const column = parseColumn('returnRequests(returnTotal)[alias=Return Total Value][numberformat==#.##]');
    expect(column.modifiers).toEqual([
      { name: 'alias', value: 'Return Total Value' },
      { name: 'numberformat', value: '=#.##' },
    ]);
  });

  it('recognises macro and document-id columns', () => {
    expect(parseColumn('$catalogVersion').kind).toBe('macro');
    expect(parseColumn('&addrID').kind).toBe('documentId');
  });

  it('tolerates the space some scripts leave before the modifiers', () => {
    expect(parseColumn('name [lang=en]')).toMatchObject({ name: 'name', modifiers: [{ name: 'lang', value: 'en' }] });
  });
});

describe('formatColumn', () => {
  it('round-trips every column in the supplied extraction', () => {
    // Not byte-for-byte: the source is hand-written and irregular about spacing
    // and about splitting modifiers across groups. What has to hold is that
    // writing a parsed column and parsing it again changes nothing further -
    // otherwise a column would drift each time it passed through the app.
    const columns = readSeedFile().flatMap((template) => template.headers.flatMap((header) => header.columns));
    expect(columns.length).toBeGreaterThan(500);

    const unstable = columns.filter((raw) => {
      const once = formatColumn(parseColumn(raw));
      return formatColumn(parseColumn(once)) !== once;
    });
    expect(unstable).toEqual([]);
  });

  it('keeps the meaning of every column in the extraction', () => {
    // Formatting normalises whitespace and merges the two-group modifier form
    // into one group; ignoring brackets, commas and spaces, what is left is
    // character-for-character what WOSG wrote.
    const columns = readSeedFile().flatMap((template) => template.headers.flatMap((header) => header.columns));
    const changed = columns.filter((raw) => {
      const written = formatColumn(parseColumn(raw));
      return written.replace(/[\s\][,]/g, '') !== raw.replace(/[\s\][,]/g, '');
    });
    expect(changed).toEqual([]);
  });
});

describe('requiredMacros', () => {
  const available = {
    productCatalog: 'masterProductCatalog',
    lang: 'en',
    catalogVersion: "catalogversion(catalog(id[default=$productCatalog]),version[default='Staged'])[unique=true]",
    supercategories: 'supercategories(code, $catalogVersion)[mode=append]',
  };

  it('follows references through macro definitions', () => {
    expect(requiredMacros([parseColumn('$supercategories')], available)).toEqual([
      'productCatalog',
      'catalogVersion',
      'supercategories',
    ]);
  });

  it('leaves out macros nothing references', () => {
    expect(requiredMacros([parseColumn('code[unique=true]')], available)).toEqual([]);
    expect(requiredMacros([parseColumn('name[lang=$lang]')], available)).toEqual(['lang']);
  });
});
