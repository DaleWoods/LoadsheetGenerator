import { describe, expect, it } from 'vitest';
import { normaliseSeed, templateId, templateName } from './seedTemplates.js';
import { readSeedFile } from './seedLibrary.js';

const templates = normaliseSeed(readSeedFile(), '2026-01-01T00:00:00.000Z');
const byId = new Map(templates.map((t) => [t.id, t]));

describe('the supplied extraction', () => {
  it('maps every record onto a library template', () => {
    expect(templates).toHaveLength(109);
    expect(templates.every((t) => t.blocks.length > 0)).toBe(true);
    expect(templates.every((t) => t.origin === 'seed' && t.verified)).toBe(true);
  });

  it('gives each record a stable id and a readable name', () => {
    expect(templateId('Products/Site Settings/Append/importScript.impex')).toBe('products-site-settings-append-importscript');
    // The file is called importScript in 60 folders; the folder is the name.
    expect(templateName('Products/Site Settings/Append/importScript.impex')).toBe('Products / Site Settings / Append');
    expect(new Set(templates.map((t) => t.id)).size).toBe(templates.length);
  });

  it('carries every header block through, with its item type and operation', () => {
    const store = byId.get('stores-new-store')!;
    expect(store.blocks).toHaveLength(11);
    expect(store.blocks.map((b) => b.itemType)).toContain('AurumPointOfService');
    expect(store.dataSource).toBe('inline');

    const categoryDescription = byId.get('categories-category-descriptions-categorydescription-importscript')!;
    expect(categoryDescription.blocks[0]!.op).toBe('UPDATE');
  });

  it('keeps the includeExternalDataMedia parameters exactly as they were written', () => {
    const akamai = byId.get('products-akamai-images-imagecount-importscript')!;
    expect(akamai.blocks[0]!.csv).toEqual({
      file: 'AkamaiImageCount.csv',
      encoding: 'UTF-8',
      delimiter: ',',
      linesToSkip: 1,
      columnsOffset: 0,
    });

    // The one script in the set that is delimited with semicolons.
    const specialBrand = byId.get('products-special-brand-specialbrandfeature-specialbrandfeatures-importscript')!;
    expect(specialBrand.blocks[0]!.csv?.delimiter).toBe(';');
  });

  it('reads the CSV layout that goes with each offset', () => {
    const appended = byId.get('products-associated-products-append-seemorestyles-append-importscript')!;
    // The See More Styles pair: no leading type column, so offset -1. This is
    // the pairing that caused the "unknown type" bug when it was got wrong.
    expect(appended.blocks[0]!.csv?.columnsOffset).toBe(-1);
    expect(appended.blocks[0]!.layout?.typeColumn).toBe(false);

    const categories = byId.get('categories-append-importscript')!;
    expect(categories.blocks[0]!.csv?.columnsOffset).toBe(0);
    expect(categories.blocks[0]!.layout).toEqual({ typeColumn: true, typeColumnLabel: 'Type (Leave Blank)' });
  });

  it('agrees with the offset every script declares', () => {
    // Every external-CSV block in the set: a leading type column means offset 0,
    // no leading type column means -1. This holds for all 59, and is the rule
    // the validator enforces on generated output.
    const blocks = templates.flatMap((t) => t.blocks).filter((b) => b.csv && b.csvHeaderRow);
    expect(blocks).toHaveLength(59);
    const disagreeing = blocks.filter((b) => b.csv!.columnsOffset !== (b.layout!.typeColumn ? 0 : -1));
    expect(disagreeing).toEqual([]);
  });

  it('takes CSV headings from the row beside the script, and drops them when it does not line up', () => {
    const siteSettings = byId.get('products-site-settings-append-importscript')!;
    expect(siteSettings.blocks[0]!.csvLabels?.slice(0, 3)).toEqual([
      'SKU',
      'Display On Site – Append',
      'Allow Purchase On Site – Append',
    ]);

    // The four Metadata variants share one CSV in a scratch folder, so the row
    // next to three of them is not the row those scripts were paired with.
    // Labels taken from the wrong column would be worse than none.
    const metadata = byId.get('products-metadata-metakeywordsonly-importscript')!;
    expect(metadata.blocks[0]!.csvHeaderRow).toBeDefined();
    expect(metadata.blocks[0]!.csvLabels).toBeUndefined();
  });

  it('tells import scripts from export scripts', () => {
    expect(byId.get('products-exports-full-product-export-productexportmasterloadsheet')!.direction).toBe('export');
    expect(byId.get('products-akamai-roundels-export-sku-wildcard-productroundelskuwildcardexport')!.direction).toBe('export');
    expect(byId.get('categories-append-importscript')!.direction).toBe('import');
    expect(templates.filter((t) => t.direction === 'export')).toHaveLength(34);
  });

  it('keeps each script macro declarations, in the order they were declared', () => {
    const variant = byId.get('products-variant-products-with-facets-importscript')!;
    expect(Object.keys(variant.macros)).toEqual([
      'productCatalog',
      'lang',
      'lang2',
      'catalogVersion',
      'supercategories',
      'approved',
      'unit',
    ]);
  });
});
