import { describe, expect, it } from 'vitest';
import { buildCatalogue } from './catalogue.js';
import { composeSpec } from './compose.js';
import { generateLoadSheet } from './generate.js';
import { aliasFor, buildExportQuery, catalogVersionValues, selectionProblems } from './exportQuery.js';
import { packageLoadSheet } from './packageSheet.js';
import { normaliseSeed } from '../library/seedTemplates.js';
import { readSeedFile } from '../library/seedLibrary.js';
import type { ExportSelection, LoadSheetSpec } from '../../shared/spec.js';

const templates = normaliseSeed(readSeedFile());
const catalogue = buildCatalogue(templates);
const context = { templates, catalogue };
const at = { generatedAt: '2026-09-05' };

function exportSheet(name: string, fields: string[], selection: ExportSelection) {
  return generateLoadSheet(
    composeSpec({ name, itemType: 'Product', fields: fields.map((field) => ({ name: field })), export: selection }, context),
    context,
    at,
  );
}

describe("the query written the way WOSG write one", () => {
  it('aliases an item type by its initials, as their query library does', () => {
    // Catalog AS c, CatalogVersion AS cv, BaseStore AS bs, AurumPriceRow AS pr:
    // the rule is consistent across docs/wosg-flexisearch-queries.md.
    expect(aliasFor('Product')).toBe('p');
    expect(aliasFor('CatalogVersion')).toBe('cv');
    expect(aliasFor('ProductFacetType')).toBe('pft');
    expect(aliasFor('VariantProduct')).toBe('vp');
    expect(aliasFor('AurumPointOfService')).toBe('apos');
  });

  it('restricts the catalog version by joining, not by a subselect', () => {
    const built = buildExportQuery(
      { kind: 'skuWildcard', pattern: '17%' },
      { itemType: 'Product', catalogVersion: { catalogId: 'masterProductCatalog', version: 'Staged' } },
    );

    // Their form, from two independent queries in the library:
    //   FROM {product as p join catalogversion as cv on {p.catalogversion}={cv.pk}
    //   JOIN catalog as c on {cv.catalog}={c.pk}}
    //   WHERE {c.id}='masterProductCatalog' and {cv.version}='Staged'
    expect(built.query).toContain('JOIN CatalogVersion AS cv ON {p:catalogVersion} = {cv:pk}');
    expect(built.query).toContain('JOIN Catalog AS c ON {cv:catalog} = {c:pk}');
    expect(built.query).toContain("{c:id} = 'masterProductCatalog'");
    expect(built.query).toContain("{cv:version} = 'Staged'");

    // The subselect this replaced, and the macro that must never appear.
    expect(built.query).not.toContain('IN ({{');
    expect(built.query).not.toContain('$catalogVersion');
  });

  it('warns when a PK has found its way into the query, but not on a SKU', () => {
    const spec = (selection: ExportSelection): LoadSheetSpec =>
      composeSpec(
        { name: 'Approved Export', itemType: 'Product', fields: [{ name: 'akamaiRoundel' }], direction: 'export', export: selection },
        context,
      );

    // 8796100493403 is "Approved" in one environment and something else in the
    // next, so a script carrying it returns nothing there rather than failing.
    const withPk = generateLoadSheet(
      spec({ kind: 'attributeWildcard', attribute: 'approvalStatus', pattern: '8796100493403' }),
      context,
      at,
    );
    expect(withPk.findings.find((f) => f.code === 'export.pkInQuery')).toMatchObject({ severity: 'warning' });

    // An eight-digit SKU is not a PK and must not be treated as one.
    const withSku = generateLoadSheet(spec({ kind: 'skuList', codes: ['17331268', '17331097'] }), context, at);
    expect(withSku.findings.find((f) => f.code === 'export.pkInQuery')).toBeUndefined();
  });

  it('leaves the joins out when there is no catalog version to restrict to', () => {
    const built = buildExportQuery({ kind: 'skuWildcard', pattern: '17%' }, { itemType: 'ProductFacetType' });
    expect(built.query).toBe("SELECT {pft:pk} FROM {ProductFacetType AS pft} WHERE {pft:code} LIKE '17%'");
  });
});

describe('the catalog version an export restricts to', () => {
  it('is read out of the script own macros, as values', () => {
    expect(
      catalogVersionValues([
        ['productCatalog', 'masterProductCatalog'],
        ['catalogVersion', "catalogversion(catalog(id[default=$productCatalog]),version[default='Staged'])[unique=true]"],
      ]),
    ).toEqual({ catalogId: 'masterProductCatalog', version: 'Staged' });
  });

  it('reads a catalog hard-coded in place of the macro, as the category scripts do', () => {
    expect(
      catalogVersionValues([
        ['catalogVersion', "catalogVersion(catalog(id[default='Goldsmiths_UK_ProductCatalog']),version[default='Staged'])[unique=true]"],
      ]),
    ).toEqual({ catalogId: 'Goldsmiths_UK_ProductCatalog', version: 'Staged' });
  });

  it('gives up rather than guessing', () => {
    expect(catalogVersionValues([['lang', 'en']])).toBeNull();
    expect(catalogVersionValues([['catalogVersion', 'catalogversion(catalog(id),version)']])).toBeNull();
  });
});

describe('the three export patterns', () => {
  it('pulls an explicit list of codes', () => {
    const out = exportSheet('Roundel Export', ['akamaiRoundel'], {
      kind: 'skuList',
      codes: ['17331268', '17331097'],
    });
    expect(out.impex.content).toContain("{p:code} IN ('17331268', '17331097')");
    // The column order is WOSG's own for an export: catalogVersion, then the key.
    expect(out.impex.content).toContain('INSERT_UPDATE Product;$catalogVersion;code[unique=true];akamaiRoundel');
  });

  it('pulls a code wildcard', () => {
    const out = exportSheet('Special Brand Wildcard', ['specialBrandField1'], {
      kind: 'skuWildcard',
      pattern: '173%',
    });
    expect(out.impex.content).toContain("{p:code} LIKE '173%'");
  });

  it('pulls everything that has a value, for an attribute wildcard', () => {
    const out = exportSheet('Roundel Wildcard', ['akamaiRoundel'], {
      kind: 'attributeWildcard',
      attribute: 'akamaiRoundel',
      pattern: '%',
    });
    expect(out.impex.content).toContain('{p:akamaiRoundel} IS NOT NULL');

    const matching = buildExportQuery(
      { kind: 'attributeWildcard', attribute: 'akamaiRoundel', pattern: 'sale%' },
      { itemType: 'Product' },
    );
    expect(matching.query).toContain("{p:akamaiRoundel} LIKE 'sale%'");
  });

  it('restricts to one catalog version, with values rather than the macro', () => {
    const out = exportSheet('Roundel Export', ['akamaiRoundel'], { kind: 'skuList', codes: ['17331268'] });
    // The macro expands to a column definition; ImpEx substitutes macros
    // everywhere, so one inside the query would paste that into the SQL.
    const query = /exportItemsFlexibleSearch\( ""(.+?)"" \)/.exec(out.impex.content)![1]!;
    expect(query).not.toMatch(/\$[A-Za-z_]/);
    expect(query).toContain("{c:id} = 'masterProductCatalog'");
    expect(query).toContain("{cv:version} = 'Staged'");
  });

  it('says where the CSV will appear, since the app cannot go and get it', () => {
    const out = exportSheet('Roundel Export', ['akamaiRoundel'], { kind: 'skuList', codes: ['17331268'] });
    expect(out.impex.content).toContain('"#% impex.setTargetFile( ""RoundelExport.csv"" );"');
    expect(out.summary).toContain('writing RoundelExport.csv inside SAP Commerce for you to collect');
  });

  it('comes out as one file, not a zip', async () => {
    const out = exportSheet('Roundel Export', ['akamaiRoundel'], { kind: 'skuList', codes: ['17331268'] });
    expect(out.csvs).toEqual([]);
    const bundle = await packageLoadSheet(out);
    expect(bundle.filename).toBe('RoundelExport.impex');
    expect(bundle.contentType).toBe('text/plain; charset=utf-8');
  });

  it('says the query mechanics are not from a WOSG script', () => {
    const out = exportSheet('Roundel Export', ['akamaiRoundel'], { kind: 'skuList', codes: ['17331268'] });
    expect(out.findings.find((f) => f.code === 'export.mechanicsUnverified')).toMatchObject({ severity: 'info' });
    expect(out.impex.content).toContain('CHECK ONCE');
    expect(out.packageable).toBe(true);
  });
});

describe('an export that would pull the wrong rows', () => {
  it('refuses a list with nothing in it', () => {
    const out = exportSheet('Empty', ['akamaiRoundel'], { kind: 'skuList', codes: [] });
    expect(out.findings.find((f) => f.code === 'export.noCodes')?.severity).toBe('error');
    expect(out.packageable).toBe(false);
  });

  it('refuses a code carrying a quote rather than escaping it away', () => {
    // A quote in a product code means the list was mangled somewhere on its way
    // here; guessing what was meant is how the wrong rows get exported.
    expect(selectionProblems({ kind: 'skuList', codes: ["17331268' OR 1=1 --"] })).toContainEqual(
      expect.objectContaining({ code: 'export.badCode' }),
    );
    const out = exportSheet('Injected', ['akamaiRoundel'], { kind: 'skuList', codes: ["17331268' OR 1=1 --"] });
    expect(out.packageable).toBe(false);
  });

  it('refuses a wildcard with no pattern', () => {
    const out = exportSheet('No pattern', ['akamaiRoundel'], { kind: 'skuWildcard', pattern: '  ' });
    expect(out.findings.find((f) => f.code === 'export.noPattern')?.severity).toBe('error');
  });

  it('still flags an attribute the library does not have', () => {
    const out = exportSheet('Editors Pick Export', ['isEditorsPick'], { kind: 'skuWildcard', pattern: '173%' });
    expect(out.findings.find((f) => f.code === 'column.unverified')).toBeDefined();
    expect(out.impex.content).toContain('UNVERIFIED COLUMN: isEditorsPick');
  });
});
