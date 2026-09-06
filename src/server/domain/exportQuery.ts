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
 * Restricting to one catalog version, joined rather than sub-selected.
 *
 * WOSG write this the same way in every query that needs it: join through
 * CatalogVersion to Catalog and compare `{c:id}` and `{cv:version}` as values.
 * The app used to express the same restriction as a nested `IN ({{ ... }})`
 * subselect, which is valid FlexibleSearch and is not what a WOSG script looks
 * like. Two of their queries settle the form; see
 * `docs/wosg-flexisearch-queries.md`.
 *
 * Values, never the `$catalogVersion` macro: ImpEx substitutes macros
 * everywhere in the file, so writing it here would paste a column definition
 * into the middle of the SQL.
 */
function catalogVersionJoin(alias: string, context: QueryContext): { joins: string; conditions: string[] } | null {
  const values = context.catalogVersion;
  if (!values) return null;
  return {
    joins:
      ` JOIN CatalogVersion AS cv ON {${alias}:catalogVersion} = {cv:pk}` +
      ` JOIN Catalog AS c ON {cv:catalog} = {c:pk}`,
    conditions: [`{c:id} = ${quoteValue(values.catalogId)}`, `{cv:version} = ${quoteValue(values.version)}`],
  };
}

export function buildExportQuery(selection: ExportSelection, context: QueryContext): BuiltQuery {
  const alias = aliasFor(context.itemType);
  const conditions: string[] = [];
  let description: string;

  switch (selection.kind) {
    case 'skuList': {
      const codes = (selection.codes ?? []).map((code) => code.trim()).filter((code) => code.length > 0);
      conditions.push(`{${alias}:code} IN (${codes.map(quoteValue).join(', ')})`);
      description = `the ${codes.length} code${codes.length === 1 ? '' : 's'} listed`;
      break;
    }
    case 'skuWildcard': {
      conditions.push(`{${alias}:code} LIKE ${quoteValue(selection.pattern ?? '')}`);
      description = `every code matching ${selection.pattern}`;
      break;
    }
    case 'attributeWildcard': {
      const attribute = selection.attribute ?? '';
      const pattern = selection.pattern ?? '';
      // An empty pattern means "has any value at all", which is how the Roundel
      // wildcard export is used: pull every product that has one.
      conditions.push(
        pattern === '' || pattern === '%'
          ? `{${alias}:${attribute}} IS NOT NULL`
          : `{${alias}:${attribute}} LIKE ${quoteValue(pattern)}`,
      );
      description =
        pattern === '' || pattern === '%'
          ? `every record that has a ${attribute}`
          : `every record whose ${attribute} matches ${pattern}`;
      break;
    }
  }

  // The catalog restriction goes first in the WHERE, as it does in theirs.
  const catalogVersion = catalogVersionJoin(alias, context);
  const from = `{${context.itemType} AS ${alias}${catalogVersion?.joins ?? ''}}`;
  const where = [...(catalogVersion?.conditions ?? []), ...conditions];

  return {
    query: `SELECT {${alias}:pk} FROM ${from} WHERE ${where.join(' AND ')}`,
    description,
  };
}

/** What the export writes inside SAP Commerce; the user collects it from HAC afterwards. */
export function targetFileFor(selection: ExportSelection, fallback: string): string {
  const named = selection.targetFile?.trim();
  return named && named.length > 0 ? named : fallback;
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
