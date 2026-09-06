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
   * on a site that takes no orders - never guessed.
   */
  orderPrefix?: string;
  /** A base store the team names, as opposed to a boutique site under one. */
  baseStore: boolean;
  /**
   * False for a site that takes no orders. The Rolex boutiques are display
   * only, so an order query restricted to "all US sites" should leave them
   * out - not because they would return nothing, but because including them
   * suggests they might.
   */
  transactional: boolean;
}

export const SITES: Site[] = [
  { uid: 'Goldsmiths_UK', name: 'Goldsmiths', region: 'UK', orderPrefix: 'gbg', baseStore: true, transactional: true },
  { uid: 'MappinAndWebb_UK', name: 'Mappin and Webb', region: 'UK', orderPrefix: 'gbm', baseStore: true, transactional: true },
  { uid: 'WatchesOfSwitzerland_UK', name: 'Watches of Switzerland UK', region: 'UK', orderPrefix: 'gbw', baseStore: true, transactional: true },
  { uid: 'HallmarkInsurance_UK', name: 'Hallmark', region: 'UK', orderPrefix: 'gbc', baseStore: true, transactional: true },

  { uid: 'Mayors_US', name: 'Mayors', region: 'US', orderPrefix: 'usy', baseStore: true, transactional: true },
  { uid: 'Betteridge_US', name: 'Betteridge', region: 'US', orderPrefix: 'usb', baseStore: true, transactional: true },
  { uid: 'WatchesOfSwitzerland_US', name: 'Watches of Switzerland US', region: 'US', orderPrefix: 'usw', baseStore: true, transactional: true },

  // The Rolex boutiques are display sites under a base store. They take no
  // orders, so they have no order prefix and nothing to query for one.
  { uid: 'RolexBoutiqueAtlanta_US', name: 'Rolex Atlanta at Mayors', region: 'US', baseStore: false, transactional: false },
  { uid: 'RolexBoutiqueOrlando_US', name: 'Rolex Orlando at Mayors', region: 'US', baseStore: false, transactional: false },
  { uid: 'RolexBoutiqueWynn_US', name: 'Rolex Wynn at Watches of Switzerland', region: 'US', baseStore: false, transactional: false },
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

/**
 * The two fields on an Order that say how it is being fulfilled, both of them
 * in WOSG's own queries.
 *
 * `deliveryType` is an enum - their query library says so in as many words
 * ("'Sales Application' and 'Delivery Type' are enum types so they need
 * EnumerationValue") and joins it that way. `deliveryMode` is the standard
 * Commerce one, LEFT JOINed to DeliveryMode in another of their queries.
 *
 * What neither the library nor anybody has recorded is which *value* of either
 * means click and collect. Until one is, the order-code prefix is the rule
 * that is known to work, and a query written on a guessed enum value would
 * return a plausible number of wrong rows. `values` fills in when somebody
 * runs the query in `deliveryTypeProbe()`.
 */
export const FULFILMENT_FIELDS = {
  deliveryType: {
    field: 'deliveryType',
    join: 'JOIN EnumerationValue AS ev ON {o:deliveryType} = {ev:pk}',
    note: 'An enum; join EnumerationValue to read {ev:code}.',
    values: [] as string[],
  },
  deliveryMode: {
    field: 'deliveryMode',
    join: 'LEFT JOIN DeliveryMode AS dm ON {o:deliveryMode} = {dm:pk}',
    note: 'The standard Commerce delivery mode. LEFT JOINed in their query, so it can be null.',
    values: [] as string[],
  },
} as const;

/** The query that would settle which delivery types exist, for somebody to run. */
export function deliveryTypeProbe(): string {
  return "SELECT DISTINCT {ev:code} 'Delivery Type' FROM {Order AS o JOIN EnumerationValue AS ev ON {o:deliveryType} = {ev:pk}}";
}

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
  const line = (site: Site): string => {
    const orders = site.transactional
      ? site.orderPrefix
        ? `, order numbers begin ${site.orderPrefix}`
        : ', order prefix not known'
      : ', takes no orders';
    return `- ${site.name}: uid ${site.uid}${orders}${site.baseStore ? '' : ' (a display boutique under a base store, not a base store itself)'}`;
  };
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
    'So a direct order is one whose code does not begin with S, and a click-and-collect order is one that does - in both regions. This is the rule to use: it is known to hold.',
    '',
    'Order also carries deliveryType (an enum - join EnumerationValue to read {ev:code}) and deliveryMode (join DeliveryMode). One of them almost certainly marks click and collect directly, but which value means it has not been established, so do not write a condition on either. If a request turns on it, say that the order-code rule is being used instead and that the enum values would settle it.',
    '',
    'The Rolex boutique sites take no orders at all; leave them out of an order query rather than including them and returning nothing.',
    'Where a prefix is not listed above, say so rather than assuming one.',
  ].join('\n');
}
