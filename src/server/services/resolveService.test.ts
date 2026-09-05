import { beforeEach, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../db/index.js';
import { migrate } from '../db/migrate.js';
import { seedLibrary } from '../library/seedLibrary.js';
import { catalogueForPrompt, type Resolution, type Resolver } from '../integrations/anthropic.js';
import { generateFromRequest } from './sheetService.js';
import { resolveDescription } from './resolveService.js';
import { loadLibrary } from './libraryService.js';

/** A stand-in for the model: whatever the test says it answered. */
function answering(resolution: Partial<Resolution>): Resolver {
  return async () => ({
    resolution: {
      itemType: 'Product',
      name: 'Test Sheet',
      direction: 'import',
      exportSelection: null,
      operation: 'INSERT_UPDATE',
      fields: [],
      rows: null,
      clarification: null,
      summary: 'A test.',
      ...resolution,
    },
    usage: { inputTokens: 0, outputTokens: 0 },
  });
}

const field = (attribute: string, extra: Partial<Resolution['fields'][number]> = {}) => ({
  attribute,
  inCatalogue: true,
  variant: null,
  why: 'asked for',
  ...extra,
});

describe('what the app does with the model answer', () => {
  let db: Db;
  beforeEach(async () => {
    db = await createDb({ driver: 'sqlite', sqliteFile: ':memory:' });
    await migrate(db);
    await seedLibrary(db);
  });

  it('builds a request the generator can take', async () => {
    const resolution = await resolveDescription(
      db,
      'Set the meta description and meta keywords on products by SKU',
      answering({
        name: 'Product Metadata',
        fields: [field('metaDescription'), field('metaKeywords')],
      }),
    );
    expect(resolution.clarification).toBeNull();
    expect(resolution.request).toMatchObject({
      name: 'Product Metadata',
      itemType: 'Product',
      fields: [{ name: 'metaDescription' }, { name: 'metaKeywords' }],
    });

    // And it goes through the same generator the field picker uses.
    const sheet = await generateFromRequest(db, resolution.request!);
    expect(sheet.impex.content).toContain(
      'INSERT_UPDATE Product;code[unique=true];metaDescription[lang=$lang];metaKeywords[lang=$lang];$catalogVersion',
    );
  });

  it('decides for itself whether an attribute is known', async () => {
    // The model says it found isEditorsPick in the catalogue. It did not.
    const resolution = await resolveDescription(
      db,
      'Set the editors pick flag',
      answering({ fields: [field('isEditorsPick', { inCatalogue: true })] }),
    );
    expect(resolution.fields[0]).toMatchObject({ attribute: 'isEditorsPick', known: false });
    expect(resolution.notes.join(' ')).toContain('is not in the library');
  });

  it('keeps a near miss as the user wrote it and offers the known name', async () => {
    const resolution = await resolveDescription(
      db,
      'Set metaKeyword on products',
      answering({ fields: [field('metaKeyword', { inCatalogue: false })] }),
    );
    expect(resolution.fields[0]!.attribute).toBe('metaKeyword');
    expect(resolution.fields[0]!.suggestions).toContain('metaKeywords');
  });

  it('refuses a shape the library has never written', async () => {
    // The one place a model could smuggle a modifier through is the variant, so
    // it is only accepted when it matches a shape from a real script.
    const invented = await resolveDescription(
      db,
      'Append see more styles',
      answering({
        fields: [field('seeMoreStylesRef', { variant: 'seeMoreStylesRef(code)[mode=replace,allownull=true]' })],
      }),
    );
    expect(invented.request!.fields[0]!.variant).toBeUndefined();
    expect(invented.notes.join(' ')).toContain('has not used');

    const real = await resolveDescription(
      db,
      'Remove see more styles',
      answering({
        fields: [
          field('seeMoreStylesRef', {
            variant: "seeMoreStylesRef(code, $catalogVersion)[mode=remove,collection-delimiter='|']",
          }),
        ],
      }),
    );
    const sheet = await generateFromRequest(db, real.request!);
    expect(sheet.impex.content).toContain('[mode=remove');
  });

  it('asks rather than generating when the item type is not one it has', async () => {
    const resolution = await resolveDescription(
      db,
      'Load some customers',
      answering({ itemType: 'Customer', fields: [field('email')] }),
    );
    expect(resolution.request).toBeNull();
    expect(resolution.clarification).toContain('Customer');
    expect(resolution.clarification).toContain('Product');
  });

  it('passes a clarifying question straight back', async () => {
    const resolution = await resolveDescription(
      db,
      'Update the description',
      answering({ clarification: 'Do you mean the product description or the category description?' }),
    );
    expect(resolution.request).toBeNull();
    expect(resolution.clarification).toContain('category description');
  });

  it('drops the key column and a repeated field', async () => {
    const resolution = await resolveDescription(
      db,
      'Set the name by SKU',
      answering({ fields: [field('code'), field('name'), field('name')] }),
    );
    expect(resolution.request!.fields).toEqual([{ name: 'name' }]);
    expect(resolution.notes.join(' ')).toContain('it is the key');
  });

  it('keeps a localized field asked for in two languages as two columns', async () => {
    const resolution = await resolveDescription(
      db,
      'Load the product description in UK and US English, and the Akamai image count, for 10 SKUs',
      answering({
        name: 'Product Descriptions And Image Count',
        fields: [
          field('description', { variant: 'description[lang=$lang]' }),
          field('description', { variant: 'description[lang=$lang2]' }),
          field('akamaiImageCount'),
        ],
      }),
    );

    expect(resolution.request!.fields).toEqual([
      { name: 'description', variant: 'description[lang=$lang]' },
      { name: 'description', variant: 'description[lang=$lang2]' },
      { name: 'akamaiImageCount' },
    ]);
    expect(resolution.notes.join(' ')).not.toContain('second copy');

    // And it has to survive generation: two columns on the header line, two
    // headings in the CSV, and both languages declared.
    const sheet = await generateFromRequest(db, resolution.request!);
    const header = sheet.impex.content.split('\n').find((line) => line.startsWith('INSERT_UPDATE'))!;
    expect(header).toContain('description[lang=$lang];description[lang=$lang2]');
    expect(sheet.impex.content).toContain('$lang=en');
    expect(sheet.impex.content).toContain('$lang2=en_US');
    expect(sheet.findings.filter((finding) => finding.severity === 'error')).toEqual([]);
  });

  it('still drops a second copy of the very same column', async () => {
    const resolution = await resolveDescription(
      db,
      'Load the description twice for some reason',
      answering({
        fields: [
          field('description', { variant: 'description[lang=$lang]' }),
          field('description', { variant: 'description[lang=$lang]' }),
        ],
      }),
    );
    expect(resolution.request!.fields).toEqual([{ name: 'description', variant: 'description[lang=$lang]' }]);
    expect(resolution.notes.join(' ')).toContain('second copy');
  });

  it('starts the rows when the description names the value but not the records', async () => {
    const resolution = await resolveDescription(
      db,
      'I want to add goldsmiths to display on site for 10 skus',
      answering({
        name: 'Goldsmiths Display On Site',
        fields: [field('syncToSite', { variant: 'syncToSite(uid)[mode=append]' })],
        rows: Array.from({ length: 10 }, () => ['', 'Goldsmiths_UK']),
      }),
    );

    expect(resolution.request!.rows).toHaveLength(10);
    expect(resolution.notes.join(' ')).toContain('left for you to paste in');

    // The point of it: the column the description named is written, the key is
    // not, and the sheet is still downloadable.
    const sheet = await generateFromRequest(db, resolution.request!);
    const [heading, first] = sheet.csvs[0]!.content.split('\r\n');
    expect(heading).toContain('Display On Site');
    expect(first).toBe(',,Goldsmiths_UK,');
    expect(sheet.packageable).toBe(true);
    expect(sheet.findings.find((f) => f.code === 'csv.rowsPending')?.severity).toBe('warning');
  });

  it('drops a row the model could fill nothing into', async () => {
    const resolution = await resolveDescription(
      db,
      'Set the name for some products',
      answering({ fields: [field('name')], rows: [['', ''], ['17331268', 'Rolex']] }),
    );
    expect(resolution.request!.rows).toEqual([['17331268', 'Rolex']]);
  });

  it('carries rows through when the description had the values in it', async () => {
    const resolution = await resolveDescription(
      db,
      'Set usePngImageFormat true for 17331268 and false for 17331097',
      answering({
        fields: [field('usePngImageFormat')],
        rows: [
          ['17331268', 'TRUE'],
          ['17331097', 'FALSE'],
        ],
      }),
    );
    const sheet = await generateFromRequest(db, resolution.request!);
    expect(sheet.csvs[0]!.content).toContain(',17331268,TRUE,');
    expect(resolution.notes.join(' ')).toContain('Took 2 rows');
  });

  it('resolves an export, with the records it should pull', async () => {
    const resolution = await resolveDescription(
      db,
      'Export the roundel for every product whose code starts 173',
      answering({
        name: 'Roundel Export',
        direction: 'export',
        exportSelection: { kind: 'skuWildcard', codes: [], pattern: '173%', attribute: '' },
        fields: [field('akamaiRoundel')],
      }),
    );
    expect(resolution.request).toMatchObject({
      direction: 'export',
      export: { kind: 'skuWildcard', pattern: '173%' },
    });

    const sheet = await generateFromRequest(db, resolution.request!);
    expect(sheet.impex.content).toContain("{i:code} LIKE '173%'");
    expect(sheet.csvs).toEqual([]);
  });

  it('asks which records an export should pull rather than exporting everything', async () => {
    const resolution = await resolveDescription(
      db,
      'Export the roundels',
      answering({ direction: 'export', exportSelection: null, fields: [field('akamaiRoundel')] }),
    );
    expect(resolution.request).toBeNull();
    expect(resolution.clarification).toContain('Which records');
  });

  it('asks when nothing usable came back', async () => {
    const resolution = await resolveDescription(db, 'do the thing', answering({ fields: [] }));
    expect(resolution.request).toBeNull();
    expect(resolution.clarification).toContain('which fields');
  });
});

describe('the catalogue the model is given', () => {
  it('is the library, not a list written by hand', async () => {
    const db = await createDb({ driver: 'sqlite', sqliteFile: ':memory:' });
    await migrate(db);
    await seedLibrary(db);
    const { catalogue } = await loadLibrary(db);
    const prompt = catalogueForPrompt(catalogue);

    expect(prompt).toContain('- Product (');
    expect(prompt).toContain('- usePngImageFormat');
    expect(prompt).toContain('TRUE/FALSE');
    // Both shapes of an append/remove pair are offered, because choosing
    // between them is what the request usually settles.
    expect(prompt).toContain("shape: seeMoreStylesRef(code, $catalogVersion)[mode=append,collection-delimiter='|']");
    expect(prompt).toContain("shape: seeMoreStylesRef(code, $catalogVersion)[mode=remove,collection-delimiter='|']");
    // And the key is named as something the generator writes.
    expect(prompt).toContain('this is the key, written for you');
  });
});
