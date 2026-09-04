import { describe, expect, it } from 'vitest';
import { buildCatalogue } from './catalogue.js';
import { normaliseSeed } from '../library/seedTemplates.js';
import { readSeedFile } from '../library/seedLibrary.js';

const templates = normaliseSeed(readSeedFile());
const catalogue = buildCatalogue(templates);

describe('the catalogue derived from the library', () => {
  it('knows the item types WOSG loads, biggest first', () => {
    expect(catalogue.itemTypes[0]!.itemType).toBe('Product');
    expect(catalogue.itemTypes.map((t) => t.itemType)).toEqual(
      expect.arrayContaining(['Product', 'VariantProduct', 'Category', 'ProductFacetType', 'Order', 'AurumPointOfService']),
    );
  });

  it('finds an attribute regardless of how it was capitalised', () => {
    expect(catalogue.find('Product', 'manufacturerName')?.uses).toBeGreaterThan(1);
    expect(catalogue.find('product', 'MANUFACTURERNAME')?.attribute).toBe('manufacturerName');
  });

  it('keeps every shape an attribute has been written in', () => {
    const entry = catalogue.find('Product', 'seeMoreStylesRef')!;
    const signatures = entry.variants.map((v) => v.signature);
    // Append and Remove are separate scripts with the same layout; both shapes
    // are kept, because the difference between them is the whole point.
    expect(signatures).toContain("seeMoreStylesRef(code, $catalogVersion)[mode=append,collection-delimiter='|']");
    expect(signatures).toContain("seeMoreStylesRef(code, $catalogVersion)[mode=remove,collection-delimiter='|']");
    expect(entry.variants[0]!.shape).toMatchObject({ type: 'collection' });
  });

  it('reads the field type off the modifiers', () => {
    expect(catalogue.find('Product', 'name')!.primary.shape).toMatchObject({ type: 'string', localized: true });
    expect(catalogue.find('Product', 'productFacetMap')!.primary.shape.type).toBe('map');
    expect(catalogue.find('Product', 'syncToSite')!.primary.shape.type).toBe('reference');
    expect(catalogue.find('Product', 'publishedDate')?.primary.shape.type).toBe('date');
  });

  it('separates flags it can prove from flags it only infers', () => {
    // Declared: the column itself carries [default=False].
    expect(catalogue.find('Product', 'usePngImageFormat')!.boolean).toBe('declared');
    expect(catalogue.find('Product', 'excludeFromFreeTextSearch')!.boolean).toBe('declared');
    // Observed: never says so, but only ever appears alone against a SKU in the
    // TrueFalse folders. Enough to warn on, not enough to fail a load sheet.
    expect(catalogue.find('Product', 'isSpecialOrder')!.boolean).toBe('observed');
    expect(catalogue.find('Product', 'manufacturerName')!.boolean).toBeUndefined();
  });

  it('carries WOSGs own CSV headings for an attribute', () => {
    expect(catalogue.find('Product', 'priceVisibleOnSite')!.primary.labels[0]!.label).toMatch(/Show Price On Site/);
  });

  it('offers a near miss but does not invent one', () => {
    expect(catalogue.suggest('Product', 'metaKeyword')).toContain('metaKeywords');
    expect(catalogue.suggest('Product', 'seeMoreStyleRef')).toContain('seeMoreStylesRef');
    // A genuinely new attribute is nothing like anything known, and should be
    // treated as new rather than quietly read as something else.
    expect(catalogue.suggest('Product', 'isEditorsPick')).toEqual([]);
  });

  it('collects the macro declarations, most-used definition first', () => {
    const catalogVersion = catalogue.macros.find((m) => m.name === 'catalogVersion')!;
    expect(catalogVersion.definition).toContain('catalogversion(catalog(id[default=$productCatalog])');
    expect(catalogue.macros.find((m) => m.name === 'productCatalog')!.definition).toBe('masterProductCatalog');
  });
});
