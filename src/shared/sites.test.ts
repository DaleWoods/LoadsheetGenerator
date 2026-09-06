/**
 * The sites are business knowledge, not something derivable from the library,
 * so what is tested is that it is right and that the gaps in it stay gaps.
 */

import { describe, expect, it } from 'vitest';
import {
  CLICK_AND_COLLECT_PREFIX,
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

  it('has not guessed which delivery type means click and collect', () => {
    // Both fields are in their own queries; neither library nor anybody has
    // said what the values are, and a condition on a guessed enum returns a
    // plausible number of wrong rows.
    expect(FULFILMENT_FIELDS.deliveryType.values).toEqual([]);
    expect(FULFILMENT_FIELDS.deliveryMode.values).toEqual([]);
    expect(deliveryTypeProbe()).toContain('JOIN EnumerationValue AS ev ON {o:deliveryType} = {ev:pk}');
    expect(sitesForPrompt()).toContain('do not write a condition on either');
  });

  it('gives every prefix to exactly one site', () => {
    const prefixes = SITES.map((s) => s.orderPrefix).filter((p): p is string => p !== undefined);
    expect(new Set(prefixes).size).toBe(prefixes.length);
  });

  it('says how a click and collect is told from a direct order', () => {
    expect(CLICK_AND_COLLECT_PREFIX).toBe('S');
    const prompt = sitesForPrompt();
    expect(prompt).toContain('S046814270');
    expect(prompt).toContain('does not begin with S');
    // And it must not offer a prefix nobody gave it.
    expect(prompt).toContain('Where a prefix is not listed above, say so');
  });
});
