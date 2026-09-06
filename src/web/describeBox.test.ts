/**
 * The examples in the describe box are the only worked examples of the app's
 * headline feature, so a field named in one has to exist.
 *
 * The first example shipped as "Set the isEditorsPick flag to true on Product
 * by SKU". There is no such attribute - not in the library, not in SAP
 * Commerce - so anybody following it got a sheet flagged unverified and a
 * confirmation tick to clear, which is precisely the experience the examples
 * are there to avoid.
 */

import { describe, expect, it } from 'vitest';
import { buildCatalogue } from '../server/domain/catalogue.js';
import { normaliseSeed } from '../server/library/seedTemplates.js';
import { readSeedFile } from '../server/library/seedLibrary.js';
import { EXAMPLES } from './DescribeBox.js';

const catalogue = buildCatalogue(normaliseSeed(readSeedFile()));

describe('the examples offered in the describe box', () => {
  it('name fields the library actually has', () => {
    for (const example of EXAMPLES) {
      for (const attribute of example.attributes) {
        expect(catalogue.find('Product', attribute), `${attribute} (${example.text})`).toBeDefined();
      }
    }
  });

  it('offers more than one, and none of them empty', () => {
    expect(EXAMPLES.length).toBeGreaterThan(1);
    for (const example of EXAMPLES) {
      expect(example.text.trim().length).toBeGreaterThan(10);
      expect(example.attributes.length).toBeGreaterThan(0);
    }
  });
});
