/**
 * The catalogs, like the sites, are knowledge the app was told rather than
 * knowledge it could work out. What is tested is that it is right, and that
 * the two things nobody has settled stay unsettled.
 */

import { describe, expect, it } from 'vitest';
import { CATALOGS, DEFAULT_CATALOG_VERSION, DEFAULT_PRODUCT_CATALOG_ID, catalogsForPrompt, catalogsForSite } from './catalogs.js';
import { SITES } from './sites.js';

describe('the catalogs and their versions', () => {
  it('defaults to what every script in the library actually writes', () => {
    expect(DEFAULT_PRODUCT_CATALOG_ID).toBe('masterProductCatalog');
    expect(DEFAULT_CATALOG_VERSION).toBe('Staged');
  });

  it('gives every base store a product catalog and a content catalog', () => {
    for (const site of SITES.filter((s) => s.baseStore)) {
      const mine = catalogsForSite(site.uid);
      expect(mine.map((c) => c.kind).sort(), site.uid).toEqual(['content', 'product']);
      for (const catalog of mine) expect(catalog.versions, catalog.name).toEqual(['Staged', 'Online']);
    }
  });

  it('gives the Rolex boutiques content only, because that is what they have', () => {
    for (const site of SITES.filter((s) => !s.baseStore)) {
      expect(catalogsForSite(site.uid).map((c) => c.kind), site.uid).toEqual(['content']);
    }
  });

  it('carries the do-not-use catalog as a warning rather than leaving it out', () => {
    // Leaving it out would let it be invented back in as a plausible name.
    const backoffice = CATALOGS.find((c) => c.name.startsWith('Backoffice'))!;
    expect(backoffice.warning).toContain('Never write to it');
    expect(backoffice.versions).toEqual(['hidden']);
  });

  it('keeps the un-regioned content catalogs, marked as unsettled', () => {
    const legacy = CATALOGS.filter((c) => c.warning?.includes('has not been established'));
    expect(legacy.map((c) => c.name)).toEqual([
      'Goldsmiths_ContentCatalog',
      'MappinAndWebb_ContentCatalog',
      'HallmarkInsurance_ContentCatalog',
      'Mayors_ContentCatalog',
      'WatchesOfSwitzerland_ContentCatalog',
    ]);
  });

  it('tells the prompt not to invent a catalog, and that the list may be short', () => {
    const prompt = catalogsForPrompt();
    expect(prompt).toContain('Never invent a catalog name that is not listed');
    expect(prompt).toContain('may still exist');
    expect(prompt).toContain('masterProductCatalog');
  });
});
