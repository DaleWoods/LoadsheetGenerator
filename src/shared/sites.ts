/**
 * WOSG's sites, their order-number prefixes, and how a click-and-collect order
 * is told apart from a direct one.
 *
 * None of this is derivable from the load sheets or the query library: it is
 * how the business is arranged, and the app was guessing at it. The
 * `Goldsmiths_UK` that went into a Display On Site sheet was the model's
 * inference from the word "Goldsmiths", correct but unverifiable. It is
 * verifiable now.
 *
 * The site ids are read off the Website list in backoffice, so they are exact.
 * The prefixes and the click-and-collect rule are Dale's, and the two gaps in
 * them are marked rather than filled in - a guessed prefix would put orders in
 * the wrong fascia and look right doing it.
 */

export type Region = 'UK' | 'US';

export interface Site {
  /** The uid in SAP Commerce, exactly as backoffice lists it. */
  uid: string;
  /** What people call it. */
  name: string;
  region: Region;
  /**
   * The first three characters of an order number placed on this site. Absent
   * where it is not yet known - never guessed.
   */
  orderPrefix?: string;
  /** A base store the team names, as opposed to a boutique site under one. */
  baseStore: boolean;
}

export const SITES: Site[] = [
  { uid: 'Goldsmiths_UK', name: 'Goldsmiths', region: 'UK', orderPrefix: 'gbg', baseStore: true },
  { uid: 'MappinAndWebb_UK', name: 'Mappin and Webb', region: 'UK', orderPrefix: 'gbm', baseStore: true },
  { uid: 'WatchesOfSwitzerland_UK', name: 'Watches of Switzerland UK', region: 'UK', orderPrefix: 'gbw', baseStore: true },
  // Hallmark is a UK base store; its order prefix has not been given.
  { uid: 'HallmarkInsurance_UK', name: 'Hallmark', region: 'UK', baseStore: true },

  { uid: 'Mayors_US', name: 'Mayors', region: 'US', orderPrefix: 'usy', baseStore: true },
  { uid: 'Betteridge_US', name: 'Betteridge', region: 'US', orderPrefix: 'usb', baseStore: true },
  { uid: 'WatchesOfSwitzerland_US', name: 'Watches of Switzerland US', region: 'US', orderPrefix: 'usw', baseStore: true },

  // Boutique sites that sit under a base store. On the Website list in
  // backoffice, not named as base stores, so they are marked as what they are.
  { uid: 'RolexBoutiqueAtlanta_US', name: 'Rolex Atlanta at Mayors', region: 'US', baseStore: false },
  { uid: 'RolexBoutiqueOrlando_US', name: 'Rolex Orlando at Mayors', region: 'US', baseStore: false },
  { uid: 'RolexBoutiqueWynn_US', name: 'Rolex Wynn at Watches of Switzerland', region: 'US', baseStore: false },
];

/**
 * A click-and-collect order is numbered from the store it is collected at, not
 * from the site it was bought on: `S` then a three or four digit store number,
 * then the order's own digits - `S046814270`, a Goldsmiths order.
 *
 * So the site prefix and the click-and-collect prefix are alternatives, which
 * is what makes "direct orders only, no click and collects" answerable: it is
 * every order whose code does not start with S.
 */
export const CLICK_AND_COLLECT_PREFIX = 'S';

export function sitesIn(region: Region): Site[] {
  return SITES.filter((site) => site.region === region);
}

/** The uids a request means by "UK", "the UK sites", "Goldsmiths", and so on. */
export function findSite(name: string): Site | undefined {
  const wanted = name.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  return SITES.find(
    (site) =>
      site.uid.toLowerCase().replace(/[^a-z0-9]/g, '') === wanted ||
      site.name.toLowerCase().replace(/[^a-z0-9]/g, '') === wanted,
  );
}

/** What the app knows about the sites, as prose for a prompt. */
export function sitesForPrompt(): string {
  const line = (site: Site): string =>
    `- ${site.name}: uid ${site.uid}${site.orderPrefix ? `, order numbers begin ${site.orderPrefix}` : ', order prefix not known'}${site.baseStore ? '' : ' (a boutique site, not a base store)'}`;
  return [
    'SITES AND BASE STORES',
    '',
    'UK:',
    ...sitesIn('UK').map(line),
    '',
    'US:',
    ...sitesIn('US').map(line),
    '',
    'ORDER NUMBERS',
    '',
    'An order placed on a site is numbered with that site\'s three-character prefix.',
    `A click-and-collect order is numbered instead from the store it is collected at: ${CLICK_AND_COLLECT_PREFIX} then a three or four digit store number, then the order's digits (S046814270 is a Goldsmiths click-and-collect order).`,
    'So a direct order is one whose code does not begin with S, and a click-and-collect order is one that does - in both regions.',
    'Where a prefix is not known above, say so rather than assuming one.',
  ].join('\n');
}
