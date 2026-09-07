/**
 * The sites are business knowledge, not something derivable from the library,
 * so what is tested is that it is right and that the gaps in it stay gaps.
 */

import { describe, expect, it } from 'vitest';
import {
  CLICK_AND_COLLECT_PREFIX,
  DELIVERY_TYPES,
  DELIVERY_TYPE_JOIN,
  FULFILMENT_FIELDS,
  SITES,
  deliveryTypeProbe,
  findSite,
  sitesForPrompt,
  sitesIn,
} from './sites.js';

describe('the sites and what their order numbers look like', () => {
  it('has the uids exactly as backoffice lists them', () => {
    // The Display On Site sheet needed Goldsmiths_UK and the app could only
    // infer it from the word "Goldsmiths". It is checkable now.
    expect(findSite('Goldsmiths')?.uid).toBe('Goldsmiths_UK');
    expect(findSite('goldsmiths_uk')?.name).toBe('Goldsmiths');
    expect(findSite('Mappin and Webb')?.uid).toBe('MappinAndWebb_UK');
    expect(findSite('Watches of Switzerland US')?.uid).toBe('WatchesOfSwitzerland_US');
    expect(findSite('Hallmark')?.uid).toBe('HallmarkInsurance_UK');
  });

  it('splits the base stores four UK and three US', () => {
    expect(sitesIn('UK').filter((s) => s.baseStore).map((s) => s.name)).toEqual([
      'Goldsmiths',
      'Mappin and Webb',
      'Watches of Switzerland UK',
      'Hallmark',
    ]);
    expect(sitesIn('US').filter((s) => s.baseStore).map((s) => s.name)).toEqual([
      'Mayors',
      'Betteridge',
      'Watches of Switzerland US',
    ]);
  });

  it('keeps the Rolex boutiques apart from the base stores', () => {
    const boutiques = SITES.filter((s) => !s.baseStore);
    expect(boutiques).toHaveLength(3);
    expect(boutiques.every((s) => s.uid.startsWith('RolexBoutique'))).toBe(true);
  });

  it('carries the prefixes given, and no prefix where none was', () => {
    expect(findSite('Goldsmiths')?.orderPrefix).toBe('gbg');
    expect(findSite('Mappin and Webb')?.orderPrefix).toBe('gbm');
    expect(findSite('Watches of Switzerland UK')?.orderPrefix).toBe('gbw');
    expect(findSite('Mayors')?.orderPrefix).toBe('usy');
    expect(findSite('Betteridge')?.orderPrefix).toBe('usb');
    expect(findSite('Watches of Switzerland US')?.orderPrefix).toBe('usw');
    expect(findSite('Hallmark')?.orderPrefix).toBe('gbc');
  });

  it('gives no order prefix to a site that takes no orders', () => {
    for (const site of SITES.filter((s) => !s.transactional)) {
      expect(site.orderPrefix, site.uid).toBeUndefined();
    }
    expect(SITES.filter((s) => s.transactional)).toHaveLength(7);
    expect(SITES.filter((s) => s.transactional).every((s) => s.orderPrefix !== undefined)).toBe(true);
  });

  it('knows the two delivery types, run against production rather than guessed', () => {
    expect(FULFILMENT_FIELDS.deliveryType.values).toEqual(['ClickAndCollect', 'Delivery']);
    expect(DELIVERY_TYPES.clickAndCollect).toBe('ClickAndCollect');
    expect(DELIVERY_TYPES.delivery).toBe('Delivery');
    // deliveryMode is still unestablished, and stays that way rather than
    // being filled in to match.
    expect(FULFILMENT_FIELDS.deliveryMode.values).toEqual([]);
  });

  it('reads the delivery type through EnumerationValue, never off a PK', () => {
    // Their own query matches {O:deliveryType} = "8796122218587" with no note
    // of what that is. A PK is a different row in every environment.
    expect(DELIVERY_TYPE_JOIN).toBe('JOIN EnumerationValue AS ev ON {o:deliveryType} = {ev:pk}');
    expect(deliveryTypeProbe()).toContain(DELIVERY_TYPE_JOIN);

    const prompt = sitesForPrompt();
    expect(prompt).toContain("Never match deliveryType against a PK");
    expect(prompt).toContain("\"Direct orders only, no click and collects\" is {ev:code} = 'Delivery'");
    // And the order-code rule is demoted to a reading aid, not a filter.
    expect(prompt).toContain('it is not how to filter for one');
  });

  it('gives every prefix to exactly one site', () => {
    const prefixes = SITES.map((s) => s.orderPrefix).filter((p): p is string => p !== undefined);
    expect(new Set(prefixes).size).toBe(prefixes.length);
  });

  it('keeps the order-code shape as a reading aid', () => {
    expect(CLICK_AND_COLLECT_PREFIX).toBe('S');
    const prompt = sitesForPrompt();
    expect(prompt).toContain('S046814270');
    expect(prompt).toContain('does not carry its site prefix');
    // And it must not offer a prefix nobody gave it.
    expect(prompt).toContain('Where a prefix is not listed above, say so');
  });
});
