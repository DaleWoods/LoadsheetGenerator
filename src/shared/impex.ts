/**
 * Reading and writing the pieces of an ImpEx script.
 *
 * Everything here is pure string work over one column expression at a time --
 * `seeMoreStylesRef(code, $catalogVersion)[mode=append,collection-delimiter='|']`
 * in, structured parts out, and back again. The generator never assembles a
 * column by pasting strings together; it builds an `ImpexColumn` and formats it,
 * so a modifier that came out of the library cannot be mangled on the way back
 * into a script.
 */

export type ColumnKind = 'attribute' | 'macro' | 'documentId';

export interface Modifier {
  name: string;
  /** Everything after the first `=`. `[numberformat==#.##]` gives `=#.##`. */
  value: string;
}

export interface ImpexColumn {
  kind: ColumnKind;
  /**
   * The expression exactly as it was read from a real script, kept so the
   * library can show what WOSG actually wrote. Absent on columns the app
   * composes itself.
   */
  raw?: string;
  /** `seeMoreStylesRef` for an attribute, `$catalogVersion` for a macro, `&addrID` for a document id. */
  name: string;
  /** The text inside the first bracket pair: `code, $catalogVersion`. */
  qualifier?: string;
  modifiers: Modifier[];
}

const MACRO_RE = /^\$[A-Za-z_][A-Za-z0-9_]*$/;
const DOC_ID_RE = /^&[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Index of the opening delimiter matching the closing one at `end`, ignoring
 * delimiters inside quotes. Returns -1 if the expression is unbalanced, which
 * is how a malformed hand-written column ends up parsed as a plain name rather
 * than throwing.
 */
function matchBackwards(text: string, end: number, open: string, close: string): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = end; i >= 0; i--) {
    const ch = text[i]!;
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }
    if (ch === close) depth++;
    else if (ch === open) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Split on a separator that is at bracket depth zero and outside quotes. */
function splitTopLevel(text: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') quote = ch;
    else if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if (ch === separator && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

function parseModifierGroup(body: string): Modifier[] {
  return splitTopLevel(body, ',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => {
      const eq = entry.indexOf('=');
      if (eq === -1) return { name: entry, value: '' };
      return { name: entry.slice(0, eq).trim(), value: entry.slice(eq + 1) };
    });
}

/**
 * Parse one column expression from a header line.
 *
 * A column is `name`, an optional `(qualifier)`, and zero or more `[modifier]`
 * groups -- and scripts in the library carry more than one group
 * (`returnRequests(returnTotal)[alias=Return Total Value][numberformat==#.##]`),
 * so the groups are peeled off the end one at a time rather than assuming one.
 */
export function parseColumn(expression: string): ImpexColumn {
  const raw = expression.trim();
  if (MACRO_RE.test(raw)) return { kind: 'macro', raw, name: raw, modifiers: [] };
  if (DOC_ID_RE.test(raw)) return { kind: 'documentId', raw, name: raw, modifiers: [] };

  let rest = raw;
  const groups: Modifier[][] = [];
  while (rest.endsWith(']')) {
    const open = matchBackwards(rest, rest.length - 1, '[', ']');
    if (open === -1) break;
    groups.unshift(parseModifierGroup(rest.slice(open + 1, rest.length - 1)));
    rest = rest.slice(0, open).trimEnd();
  }

  let qualifier: string | undefined;
  if (rest.endsWith(')')) {
    const open = matchBackwards(rest, rest.length - 1, '(', ')');
    if (open !== -1) {
      qualifier = rest.slice(open + 1, rest.length - 1);
      rest = rest.slice(0, open).trimEnd();
    }
  }

  return {
    kind: 'attribute',
    raw,
    name: rest.trim(),
    ...(qualifier === undefined ? {} : { qualifier }),
    modifiers: groups.flat(),
  };
}

/**
 * Write a column back out. Modifiers go in one group -- the multi-group form
 * seen in a couple of the order exports means the same thing to SAP, and one
 * group keeps generated scripts uniform.
 */
export function formatColumn(column: ImpexColumn): string {
  if (column.kind !== 'attribute') return column.name;
  const qualifier = column.qualifier === undefined ? '' : `(${column.qualifier})`;
  const modifiers = column.modifiers.length
    ? `[${column.modifiers.map((m) => (m.value === '' ? m.name : `${m.name}=${m.value}`)).join(',')}]`
    : '';
  return `${column.name}${qualifier}${modifiers}`;
}

export function findModifier(column: ImpexColumn, name: string): string | undefined {
  return column.modifiers.find((m) => m.name.toLowerCase() === name.toLowerCase())?.value;
}

export function hasModifier(column: ImpexColumn, name: string): boolean {
  return findModifier(column, name) !== undefined;
}

export function isUnique(column: ImpexColumn): boolean {
  const value = findModifier(column, 'unique');
  return value !== undefined && value.toLowerCase() !== 'false';
}

/** A macro reference (`$catalogVersion`) written as a column, or referenced inside one. */
export function macroReferences(text: string): string[] {
  return [...text.matchAll(/\$([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1]!);
}

/**
 * Macros a block actually depends on: the ones it names as columns, plus the
 * ones those macros name in turn, plus any referenced from inside a qualifier
 * or modifier. Generated scripts declare exactly these, so a sheet built from
 * two ticked fields does not carry the master sheet's whole preamble.
 */
export function requiredMacros(columns: ImpexColumn[], available: Record<string, string>): string[] {
  const needed = new Set<string>();
  const visit = (text: string): void => {
    for (const name of macroReferences(text)) {
      if (!(name in available) || needed.has(name)) continue;
      needed.add(name);
      visit(available[name]!);
    }
  };
  for (const column of columns) visit(column.raw ?? formatColumn(column));
  return Object.keys(available).filter((name) => needed.has(name));
}
