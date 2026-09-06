/**
 * The query an export script runs (§6.5).
 *
 * Three patterns, all present in WOSG's own export folders: an explicit list of
 * product codes, a code wildcard, and a wildcard on some other attribute (the
 * Roundel and Special Brand wildcard exports).
 *
 * A caveat worth keeping in view: the supplied extraction captured every export
 * script's header line but not its `setTargetFile` / `exportItems` lines, so the
 * mechanics here are written from the ImpEx documentation rather than copied
 * from a script WOSG has run. That is why a generated export says so in its own
 * comments and in the findings - the same treatment an unverified attribute
 * gets. Replace this with their wording once a real export script is to hand;
 * the header line and the column order above it are already theirs.
 */

import type { ExportSelection } from '../../shared/spec.js';

/** FlexibleSearch takes doubled single quotes, and a value carrying one is refused rather than escaped away. */
export function quoteValue(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export interface CatalogVersionValues {
  catalogId: string;
  version: string;
}

export interface QueryContext {
  itemType: string;
  /**
   * The catalog and version to restrict to, as values. An export that does not
   * restrict returns the Staged and Online rows both, which looks like
   * duplicates in the CSV.
   *
   * Values, not the `$catalogVersion` macro: that macro expands to a column
   * definition - `catalogversion(catalog(id[...]),version[...])[unique=true]` -
   * and ImpEx substitutes macros everywhere in the file, so writing it inside
   * the query would paste a column definition into the middle of the SQL.
   */
  catalogVersion?: CatalogVersionValues;
}

/**
 * Read the catalog and version out of the `$catalogVersion` macro the script
 * declares, so the query can name them as values.
 *
 * `catalogversion(catalog(id[default=$productCatalog]),version[default='Staged'])`
 * gives masterProductCatalog and Staged; the category scripts hard-code a site
 * catalog in the same place. Returns null when it cannot be read, and the
 * caller then leaves the restriction out and says so rather than guessing.
 */
export function catalogVersionValues(macros: [string, string][]): CatalogVersionValues | null {
  const entry = macros.find(([name]) => /catalogversion/i.test(name));
  if (!entry) return null;
  const definition = entry[1];

  const unquote = (value: string): string => value.trim().replace(/^['"]|['"]$/g, '');
  const version = /version\s*\[\s*default\s*=\s*([^\]]+)\]/i.exec(definition)?.[1];
  const catalog = /\bid\s*\[\s*default\s*=\s*([^\]]+)\]/i.exec(definition)?.[1];
  if (!version || !catalog) return null;

  const catalogValue = unquote(catalog);
  const catalogId = catalogValue.startsWith('$')
    ? macros.find(([name]) => name === catalogValue.slice(1))?.[1]?.trim()
    : catalogValue;
  if (!catalogId || catalogId.startsWith('$')) return null;

  return { catalogId, version: unquote(version) };
}

export interface BuiltQuery {
  query: string;
  /** What the query does, in words, for the summary panel. */
  description: string;
}

/**
 * The alias for an item type, the way WOSG aliases one: its initials.
 *
 * `Catalog AS c`, `CatalogVersion AS cv`, `BaseStore AS bs`,
 * `CategoryProductRelation AS cpr`, `AurumPointOfService AS pos` - the rule is
 * consistent across their query library, and matters because somebody who
 * opens a generated export in the console should find it written the way they
 * write one. `i` for "item" was out of the ImpEx documentation, not from here.
 */
export function aliasFor(itemType: string): string {
  const initials = itemType
    .replace(/[^A-Za-z]/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .map((word) => word[0]!.toLowerCase())
    .join('');
  return initials.length > 0 ? initials : 'i';
}

/**
 * The query, written the way WOSG's own export scripts write one.
 *
 * Seventeen of their thirty-four export scripts use this exact form, and the
 * three the app can produce - a code list, a code wildcard, a wildcard on
 * another attribute - each have a counterpart among them:
 *
 *   select {p.pk} FROM {Product as p JOIN CatalogVersion AS cv ON {p:catalogversion} = {cv.pk}
 *   and {cv.version} = 'Staged' JOIN Catalog as c ON {c.pk} = {cv.Catalog}
 *   and {c.id} = 'masterProductCatalog' } where {p.code} LIKE '1733%'
 *
 * Copied rather than tidied. The mixed casing (`as p` beside `AS cv`) and the
 * mixed `{p:catalogversion}` / `{cv.pk}` reference styles are theirs, and this
 * is the form that has run against production - which beats a neater one that
 * has not. The restriction sits in the ON clauses, so the WHERE carries only
 * what was asked for.
 *
 * Values, never the `$catalogVersion` macro: ImpEx substitutes macros
 * everywhere in the file, so writing it here would paste a column definition
 * into the middle of the SQL.
 */
function catalogVersionJoins(alias: string, context: QueryContext): string {
  const values = context.catalogVersion;
  if (!values) return '';
  return (
    ` JOIN CatalogVersion AS cv ON {${alias}:catalogversion} = {cv.pk} and {cv.version} = ${quoteValue(values.version)}` +
    ` JOIN Catalog as c ON {c.pk} = {cv.Catalog} and {c.id} = ${quoteValue(values.catalogId)} `
  );
}

export function buildExportQuery(selection: ExportSelection, context: QueryContext): BuiltQuery {
  const alias = aliasFor(context.itemType);
  let where: string;
  let description: string;

  switch (selection.kind) {
    case 'skuList': {
      const codes = (selection.codes ?? []).map((code) => code.trim()).filter((code) => code.length > 0);
      where = `{${alias}.code} in (${codes.map(quoteValue).join(', ')})`;
      description = `the ${codes.length} code${codes.length === 1 ? '' : 's'} listed`;
      break;
    }
    case 'skuWildcard': {
      where = `{${alias}.code} LIKE ${quoteValue(selection.pattern ?? '')}`;
      description = `every code matching ${selection.pattern}`;
      break;
    }
    case 'attributeWildcard': {
      const attribute = selection.attribute ?? '';
      const pattern = selection.pattern ?? '';
      // An empty pattern means "has any value at all", which is how the Roundel
      // wildcard export is used: pull every product that has one.
      const any = pattern === '' || pattern === '%';
      where = any ? `{${alias}.${attribute}} IS NOT NULL` : `{${alias}.${attribute}} LIKE ${quoteValue(pattern)}`;
      description = any
        ? `every record that has a ${attribute}`
        : `every record whose ${attribute} matches ${pattern}`;
      break;
    }
  }

  const from = `{${context.itemType} as ${alias}${catalogVersionJoins(alias, context)}}`;
  return { query: `select {${alias}.pk} FROM ${from} where ${where}`, description };
}

/**
 * What the export writes inside SAP Commerce; the user collects it from HAC
 * afterwards.
 *
 * `products.csv` in twenty-eight of WOSG's thirty-four export scripts, whatever
 * the sheet is called - the file is picked up from HAC straight after the run,
 * so it is a scratch name rather than an archive one. Naming it after the sheet
 * was the app's own idea and made a generated export look unlike theirs.
 */
export function targetFileFor(selection: ExportSelection, itemType: string): string {
  const named = selection.targetFile?.trim();
  if (named && named.length > 0) return named;
  return /^product$/i.test(itemType) ? 'products.csv' : `${itemType}.csv`;
}

export interface SelectionProblem {
  code: string;
  message: string;
}

/** What is missing or unusable about a selection, before anything is written. */
export function selectionProblems(selection: ExportSelection): SelectionProblem[] {
  const problems: SelectionProblem[] = [];
  const carriesQuote = (value: string): boolean => value.includes("'");

  if (selection.kind === 'skuList') {
    const codes = (selection.codes ?? []).map((code) => code.trim()).filter((code) => code.length > 0);
    if (codes.length === 0) {
      problems.push({ code: 'export.noCodes', message: 'An export by list needs at least one code.' });
    }
    // Refused rather than escaped: a quote in a product code means the list was
    // pasted from somewhere that mangled it, and guessing what was meant is how
    // the wrong rows get exported.
    const quoted = codes.filter(carriesQuote);
    if (quoted.length > 0) {
      problems.push({
        code: 'export.badCode',
        message: `${quoted.length} code${quoted.length === 1 ? '' : 's'} contain a quote character. Check what was pasted.`,
      });
    }
  }

  if (selection.kind === 'skuWildcard' && !(selection.pattern ?? '').trim()) {
    problems.push({
      code: 'export.noPattern',
      message: 'An export by wildcard needs a pattern, for example 173% for every code starting 173.',
    });
  }

  if (selection.kind === 'attributeWildcard' && !(selection.attribute ?? '').trim()) {
    problems.push({ code: 'export.noAttribute', message: 'Choose the attribute to match on.' });
  }

  if (carriesQuote(selection.pattern ?? '')) {
    problems.push({ code: 'export.badPattern', message: 'A pattern cannot contain a quote character.' });
  }

  return problems;
}
