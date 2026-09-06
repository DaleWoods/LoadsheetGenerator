/**
 * The generated export, against WOSG export scripts that have run.
 *
 * The original extraction captured each export's header line but not the two
 * lines that wrap it, so the mechanics were written from the ImpEx
 * documentation and a generated export failed in HAC with nothing to say. The
 * scripts themselves are here now, and these tests hold the generator to them
 * rather than to my reading of the documentation - so the answer to "why does
 * theirs work and mine not" cannot come back.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildCatalogue } from './catalogue.js';
import { composeSpec } from './compose.js';
import { generateLoadSheet } from './generate.js';
import { normaliseSeed } from '../library/seedTemplates.js';
import { readSeedFile } from '../library/seedLibrary.js';
import type { ExportSelection } from '../../shared/spec.js';

const templates = normaliseSeed(readSeedFile());
const context = { templates, catalogue: buildCatalogue(templates) };
const at = { generatedAt: '2026-09-06' };

function reference(name: string): string {
  return readFileSync(fileURLToPath(new URL(`../library/reference/${name}`, import.meta.url)), 'utf8');
}

/** The script without the comment header the app adds and WOSG's own notes. */
function body(script: string): string[] {
  return script
    .split(/\r?\n/)
    .filter((line) => !line.startsWith('#'))
    .join('\n')
    .trim()
    .split('\n');
}

function generateExport(name: string, attribute: string, selection: ExportSelection): string {
  return generateLoadSheet(
    composeSpec(
      { name, itemType: 'Product', fields: [{ name: attribute }], direction: 'export', export: selection },
      context,
    ),
    context,
    at,
  ).impex.content;
}

describe('an export written the way the ones that work are written', () => {
  it('reproduces the Roundel SKU wildcard export line for line', () => {
    const ours = body(
      generateExport('Product Roundel Sku Wildcard Export', 'akamaiRoundel', {
        kind: 'skuWildcard',
        pattern: '1733%',
      }),
    );
    expect(ours).toEqual(body(reference('ProductRoundelSkuWildcardExport.impex')));
  });

  it('reproduces the Roundel SKU list export line for line', () => {
    const ours = body(
      generateExport('Product Roundel Sku List Export', 'akamaiRoundel', {
        kind: 'skuList',
        codes: ['22222222'],
      }),
    );
    expect(ours).toEqual(body(reference('ProductRoundelSkuListExport.impex')));
  });

  it('reproduces the Roundel attribute wildcard export line for line', () => {
    const ours = body(
      generateExport('Product Roundel Roundel Wildcard Export', 'akamaiRoundel', {
        kind: 'attributeWildcard',
        attribute: 'akamaiRoundel',
        pattern: 'sale%',
      }),
    );
    expect(ours).toEqual(body(reference('ProductRoundelRoundelWildcardExport.impex')));
  });

  it('writes the script with CRLF, as all 107 of theirs are written', () => {
    const script = generateExport('X', 'akamaiRoundel', { kind: 'skuWildcard', pattern: '17%' });
    expect(script).toContain('\r\n');
    expect(/[^\r]\n/.test(script)).toBe(false);
  });

  it('carries no enableCodeExecution line, which none of their exports has', () => {
    const script = generateExport('X', 'akamaiRoundel', { kind: 'skuWildcard', pattern: '17%' });
    expect(script).not.toContain('enableCodeExecution');
  });
});
