import { describe, expect, it } from 'vitest';
import { buildCatalogue } from './catalogue.js';
import { composeSpec } from './compose.js';
import { generateLoadSheet } from './generate.js';
import { normaliseSeed } from '../library/seedTemplates.js';
import { readSeedFile } from '../library/seedLibrary.js';
import type { LoadSheetSpec } from '../../shared/spec.js';

const templates = normaliseSeed(readSeedFile());
const catalogue = buildCatalogue(templates);
const context = { templates, catalogue };
const at = { generatedAt: '2026-09-04' };

function generate(spec: LoadSheetSpec) {
  return generateLoadSheet(spec, context, at);
}

describe('generating an import load sheet', () => {
  const flagSheet = () =>
    composeSpec(
      {
        name: 'Use Png Image Format',
        itemType: 'Product',
        intent: 'Set usePngImageFormat on Product by SKU.',
        fields: [{ name: 'usePngImageFormat' }],
        rows: [
          ['17331268', 'true'],
          ['17331097', 'FALSE'],
        ],
      },
      context,
    );

  it('writes the script WOSG would have written by hand', () => {
    const out = generate(flagSheet());
    expect(out.impex.filename).toBe('UsePngImageFormat.impex');
    expect(out.impex.content).toContain('"#% impex.enableCodeExecution(true);"');
    expect(out.impex.content).toContain('$productCatalog=masterProductCatalog');
    expect(out.impex.content).toContain(
      'INSERT_UPDATE Product;code[unique=true];usePngImageFormat[default=False];$catalogVersion',
    );
    expect(out.impex.content).toContain(
      '"#% impex.includeExternalDataMedia( ""UsePngImageFormat.csv"", ""UTF-8"", \',\', 1, 0);"',
    );
  });

  it('declares a macro after the macros it references', () => {
    const content = generate(flagSheet()).impex.content;
    expect(content.indexOf('$productCatalog=')).toBeLessThan(content.indexOf('$catalogVersion='));
  });

  it('leaves out macros the columns do not use', () => {
    // The template this was matched to declares $supercategories and $approved.
    const content = generate(flagSheet()).impex.content;
    expect(content).not.toContain('$supercategories=');
    expect(content).not.toContain('$approved=');
  });

  it('writes a CSV whose headings are WOSGs own wording, in header-line order', () => {
    const csv = generate(flagSheet()).csvs[0]!;
    expect(csv.filename).toBe('UsePngImageFormat.csv');
    const [header, first] = csv.content.split('\r\n');
    expect(header).toBe('Type (Leave Blank),SKU,Use Png Image Format [default=False],Catalogue Version (Leave Blank)');
    // The leading type column is left empty, which is what makes offset 0 right.
    expect(first).toBe(',17331268,TRUE,');
  });

  it('writes booleans as TRUE and FALSE whatever the user typed', () => {
    const rows = generate(flagSheet()).csvs[0]!.content.split('\r\n');
    expect(rows[1]).toContain(',TRUE,');
    expect(rows[2]).toContain(',FALSE,');
  });

  it('passes its own validation and can be packaged', () => {
    const out = generate(flagSheet());
    expect(out.findings).toEqual([]);
    expect(out.packageable).toBe(true);
  });

  it('copies columnsOffset and the CSV layout together from the matched template', () => {
    // See More Styles is the pair whose CSV has no leading type column, and so
    // reads at offset -1. Both halves have to come from the same place: an
    // offset of -1 with a leading blank column is the "unknown type" bug.
    const out = generate(
      composeSpec(
        {
          name: 'See More Styles Append',
          itemType: 'Product',
          fields: [{ name: 'seeMoreStylesRef' }],
          rows: [['17331268', '17331097|17331228']],
        },
        context,
      ),
    );
    expect(out.impex.content).toContain('1, -1);"');
    expect(out.csvs[0]!.content.split('\r\n')[0]).toBe(
      'SKU,See More Styles - Associated Product List - Append,Catalogue Version (Leave Blank)',
    );
    expect(out.findings.filter((f) => f.severity === 'error')).toEqual([]);
  });

  it('takes the append or remove shape the caller asked for', () => {
    const remove = generate(
      composeSpec(
        {
          name: 'See More Styles Remove',
          itemType: 'Product',
          fields: [
            {
              name: 'seeMoreStylesRef',
              variant: "seeMoreStylesRef(code, $catalogVersion)[mode=remove,collection-delimiter='|']",
            },
          ],
        },
        context,
      ),
    );
    expect(remove.impex.content).toContain('[mode=remove');
    expect(remove.impex.content).not.toContain('[mode=append');
  });

  it('keeps the shape the matched sheet uses, not the one used most often', () => {
    // Site Settings comes in an Append and a Remove pair. The plain form of
    // these columns is more common across the library, so taking the most-used
    // shape would turn an append into an overwrite without saying so.
    const out = generate(
      composeSpec(
        {
          name: 'Site Settings Append',
          itemType: 'Product',
          fields: [{ name: 'homeDeliveryAvailableOnSite' }, { name: 'clickAndCollectAvailableOnSite' }],
        },
        context,
      ),
    );
    expect(out.impex.content).toContain(
      'code[unique=true];homeDeliveryAvailableOnSite(uid)[mode=append];clickAndCollectAvailableOnSite(uid)[mode=append];$catalogVersion',
    );
    expect(out.csvs[0]!.content).toContain('Home Delivery Available on site – Append');
  });

  it('writes the primary language when a sheet carries both', () => {
    // The Metadata sheet writes metaDescription twice, once per language. The
    // first is the primary; taking the later one would produce a sheet that
    // only ever writes the US text, and nothing on screen would say so.
    const out = generate(
      composeSpec(
        { name: 'Product Metadata', itemType: 'Product', fields: [{ name: 'metaDescription' }, { name: 'metaKeywords' }] },
        context,
      ),
    );
    expect(out.impex.content).toContain('metaDescription[lang=$lang];metaKeywords[lang=$lang];');
    expect(out.impex.content).not.toContain('[lang=$lang2]');
  });

  it('keys a VariantProduct on its parent and its own code', () => {
    const out = generate(
      composeSpec({ name: 'Variant Names', itemType: 'VariantProduct', fields: [{ name: 'name' }] }, context),
    );
    expect(out.impex.content).toContain('INSERT_UPDATE VariantProduct;baseProduct(code, $catalogVersion);code[unique=true];');
  });

  it('never hands back a stored template unchanged', () => {
    // Composed from the library, not served from it: the script carries this
    // installation's file names and only the columns that were asked for.
    const out = generate(flagSheet());
    const sources = templates.map((t) => t.sourcePath);
    expect(sources).not.toContain(out.impex.filename);
    expect(out.impex.content).toContain('Generated by the WOSG Load Sheet Generator');
  });
});

describe('generating for an attribute the library does not have', () => {
  const unknown = () =>
    composeSpec(
      {
        name: 'Editors Pick',
        itemType: 'Product',
        fields: [{ name: 'isEditorsPick' }],
      },
      context,
    );

  it('still generates, and says in the script that it is unverified', () => {
    const out = generate(unknown());
    expect(out.impex.content).toContain('INSERT_UPDATE Product;code[unique=true];isEditorsPick;$catalogVersion');
    expect(out.impex.content).toContain('UNVERIFIED');
    expect(out.impex.content).toMatch(/UNVERIFIED COLUMN: isEditorsPick/);
    expect(out.packageable).toBe(true);
  });

  it('warns on screen too, and does not substitute a near match', () => {
    const out = generate(unknown());
    const warning = out.findings.find((f) => f.code === 'column.unverified')!;
    expect(warning.severity).toBe('warning');
    expect(warning.message).toContain('isEditorsPick');
    expect(warning.message).not.toContain('Did you mean');
  });

  it('offers a did-you-mean for a near miss instead of quietly correcting it', () => {
    const out = generate(
      composeSpec({ name: 'Meta Keyword', itemType: 'Product', fields: [{ name: 'metaKeyword' }] }, context),
    );
    // The name the user wrote is what gets generated; the known one it is
    // close to appears only as a suggestion, never substituted into the script.
    expect(out.impex.content).toContain('code[unique=true];metaKeyword;$catalogVersion');
    expect(out.impex.content.replace(/\r?\n# /g, ' ')).toContain('Closest known attribute: metaKeywords.');
    expect(out.findings.find((f) => f.code === 'column.unverified')!.message).toContain('Did you mean `metaKeywords`');
  });

  it('does not borrow the shape of an unrelated template', () => {
    // Nothing in the library shares an attribute with this request, so the
    // house style stands in: the key, $catalogVersion, and nothing else.
    const out = generate(unknown());
    expect(out.impex.content).not.toContain('$supercategories');
    expect(out.findings.some((f) => f.code === 'csv.offsetDefault')).toBe(true);
  });
});
