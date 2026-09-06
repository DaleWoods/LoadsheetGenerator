/**
 * WOSG's catalogs and the versions of each, read off the Catalog Versions list
 * in backoffice.
 *
 * This is the other half of the knowledge a load sheet or an export needs and
 * cannot derive. Every generated sheet restricts itself to a catalog version;
 * up to now the only one the app had ever seen was `masterProductCatalog` /
 * `Staged`, copied out of the scripts, and it had no way to answer "the same
 * thing but for Mayors".
 *
 * A caveat kept deliberately: the lists were read from a scrolling table, so an
 * absent version means it was not seen rather than that it does not exist.
 * `versions` is what was observed.
 */

import type { Region } from './sites.js';

export type CatalogKind = 'product' | 'content' | 'other';

export interface Catalog {
  /** The name as backoffice shows it. */
  name: string;
  kind: CatalogKind;
  /** The versions seen on the list. */
  versions: string[];
  /** The site uid this belongs to, where it belongs to one. */
  site?: string;
  region?: Region;
  /** Why not to use it, when there is a reason. */
  warning?: string;
}

export const CATALOGS: Catalog[] = [
  // The master catalogs. Every load sheet in the library writes to the master
  // product catalog, Staged - `$productCatalog=masterProductCatalog` is the
  // id, which the scripts give and the backoffice list shows as a name.
  { name: 'Master Product Catalog', kind: 'product', versions: ['Staged'] },
  { name: 'Master Content Catalog', kind: 'content', versions: ['Staged', 'Online'] },
  { name: 'Default-Catalog', kind: 'other', versions: ['Staged', 'Online'] },
  {
    name: 'Backoffice Configuraiton Catalog (do not use)',
    kind: 'other',
    versions: ['hidden'],
    warning: 'Marked "do not use" in backoffice, and hidden. Never write to it. (The spelling is theirs.)',
  },

  // UK fascias: a product and a content catalog each, both Staged and Online.
  { name: 'Goldsmiths_UK_ProductCatalog', kind: 'product', versions: ['Staged', 'Online'], site: 'Goldsmiths_UK', region: 'UK' },
  { name: 'Goldsmiths_UK_ContentCatalog', kind: 'content', versions: ['Staged', 'Online'], site: 'Goldsmiths_UK', region: 'UK' },
  { name: 'MappinAndWebb_UK_ProductCatalog', kind: 'product', versions: ['Staged', 'Online'], site: 'MappinAndWebb_UK', region: 'UK' },
  { name: 'MappinAndWebb_UK_ContentCatalog', kind: 'content', versions: ['Staged', 'Online'], site: 'MappinAndWebb_UK', region: 'UK' },
  { name: 'WatchesOfSwitzerland_UK_ProductCatalog', kind: 'product', versions: ['Staged', 'Online'], site: 'WatchesOfSwitzerland_UK', region: 'UK' },
  { name: 'WatchesOfSwitzerland_UK_ContentCatalog', kind: 'content', versions: ['Staged', 'Online'], site: 'WatchesOfSwitzerland_UK', region: 'UK' },
  { name: 'HallmarkInsurance_UK_ProductCatalog', kind: 'product', versions: ['Staged', 'Online'], site: 'HallmarkInsurance_UK', region: 'UK' },
  { name: 'HallmarkInsurance_UK_ContentCatalog', kind: 'content', versions: ['Staged', 'Online'], site: 'HallmarkInsurance_UK', region: 'UK' },

  // US fascias, the same shape.
  { name: 'Mayors_US_ProductCatalog', kind: 'product', versions: ['Staged', 'Online'], site: 'Mayors_US', region: 'US' },
  { name: 'Mayors_US_ContentCatalog', kind: 'content', versions: ['Staged', 'Online'], site: 'Mayors_US', region: 'US' },
  { name: 'Betteridge_US_ProductCatalog', kind: 'product', versions: ['Staged', 'Online'], site: 'Betteridge_US', region: 'US' },
  { name: 'Betteridge_US_ContentCatalog', kind: 'content', versions: ['Staged', 'Online'], site: 'Betteridge_US', region: 'US' },
  { name: 'WatchesOfSwitzerland_US_ProductCatalog', kind: 'product', versions: ['Staged', 'Online'], site: 'WatchesOfSwitzerland_US', region: 'US' },
  { name: 'WatchesOfSwitzerland_US_ContentCatalog', kind: 'content', versions: ['Staged', 'Online'], site: 'WatchesOfSwitzerland_US', region: 'US' },

  // The Rolex boutiques have content only - no product catalog of their own.
  { name: 'RolexBoutiqueAtlanta_US_ContentCatalog', kind: 'content', versions: ['Staged', 'Online'], site: 'RolexBoutiqueAtlanta_US', region: 'US' },
  { name: 'RolexBoutiqueOrlando_US_ContentCatalog', kind: 'content', versions: ['Staged', 'Online'], site: 'RolexBoutiqueOrlando_US', region: 'US' },
  { name: 'RolexBoutiqueWynn_US_ContentCatalog', kind: 'content', versions: ['Staged', 'Online'], site: 'RolexBoutiqueWynn_US', region: 'US' },

  // Older content catalogs without the region in the name. On the list beside
  // the regioned ones, so both exist; which is current is not recorded here
  // because nobody has said.
  { name: 'Goldsmiths_ContentCatalog', kind: 'content', versions: ['Staged', 'Online'], warning: 'Sits beside Goldsmiths_UK_ContentCatalog; which is current has not been established.' },
  { name: 'MappinAndWebb_ContentCatalog', kind: 'content', versions: ['Staged', 'Online'], warning: 'Sits beside MappinAndWebb_UK_ContentCatalog; which is current has not been established.' },
  { name: 'HallmarkInsurance_ContentCatalog', kind: 'content', versions: ['Staged', 'Online'], warning: 'Sits beside HallmarkInsurance_UK_ContentCatalog; which is current has not been established.' },
  { name: 'Mayors_ContentCatalog', kind: 'content', versions: ['Staged', 'Online'], warning: 'Sits beside Mayors_US_ContentCatalog; which is current has not been established.' },
  { name: 'WatchesOfSwitzerland_ContentCatalog', kind: 'content', versions: ['Staged', 'Online'], warning: 'Sits beside the UK and US content catalogs; which is current has not been established.' },
];

/**
 * The catalog id a load sheet writes by default.
 *
 * Every one of the 107 scripts declares `$productCatalog=masterProductCatalog`
 * and defaults the version to Staged, so that is the default here too - and it
 * is an id, lower-camel, not the display name the backoffice list shows.
 */
export const DEFAULT_PRODUCT_CATALOG_ID = 'masterProductCatalog';
export const DEFAULT_CATALOG_VERSION = 'Staged';

export function catalogsForSite(siteUid: string): Catalog[] {
  return CATALOGS.filter((catalog) => catalog.site === siteUid);
}

/** What the app knows about the catalogs, as prose for a prompt. */
export function catalogsForPrompt(): string {
  const line = (c: Catalog): string =>
    `- ${c.name} (${c.kind}, ${c.versions.join(' and ')})${c.site ? ` - ${c.site}` : ''}${c.warning ? ` - ${c.warning}` : ''}`;
  return [
    'CATALOGS AND THEIR VERSIONS',
    '',
    ...CATALOGS.map(line),
    '',
    `Product load sheets write to ${DEFAULT_PRODUCT_CATALOG_ID} / ${DEFAULT_CATALOG_VERSION} unless the request says otherwise - that is what every script in the library does. In ImpEx the id is ${DEFAULT_PRODUCT_CATALOG_ID}, not the display name above.`,
    'A fascia has its own product and content catalog; the Rolex boutiques have content only.',
    'The list was read from a scrolling table, so a version not shown above may still exist. Never invent a catalog name that is not listed.',
  ].join('\n');
}
