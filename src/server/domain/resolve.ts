/**
 * Turning a specification into the columns that will actually be written.
 *
 * This is the layer that stands between what was asked for and what reaches a
 * header line. A specification names an attribute; the shape of the column -
 * its qualifier and its modifiers - comes from the library, from a script WOSG
 * has already run. An attribute the library has never seen still generates, but
 * it is marked unverified here, and that mark is what puts the warning on the
 * screen and the comment in the .impex (§6.1).
 *
 * `columnsOffset` and the CSV layout are resolved the same way: copied from the
 * closest matching template rather than worked out from the columns. Deriving
 * it from first principles is what broke the See More Styles import.
 */

import { fieldShape, type FieldShape } from '../../shared/fieldTypes.js';
import { formatColumn, isUnique, parseColumn, requiredMacros, type ImpexColumn } from '../../shared/impex.js';
import type { CsvLayout, Direction, ImpexOperation, LibraryTemplate } from '../../shared/library.js';
import type { ExportSelection, LoadSheetSpec, SpecBlock, SpecColumn, SpecCsv } from '../../shared/spec.js';
import type { BooleanConfidence, Catalogue } from './catalogue.js';

export interface ResolvedColumn {
  source: SpecColumn;
  column: ImpexColumn;
  /** The column as it will appear on the header line. */
  expression: string;
  /** The CSV heading for this column. */
  label: string;
  shape: FieldShape;
  boolean?: BooleanConfidence;
  unique: boolean;
  /** `known` means the library has this attribute on this item type. */
  status: 'known' | 'unverified';
  /** Known attribute names this one is close to, when it is not itself known. */
  suggestions?: string[];
  /** Where the shape came from, for the summary: a library template id. */
  shapeFrom?: string;
}

export interface ResolvedCsv extends SpecCsv {
  /** The full CSV header row, type column included. */
  headerRow: string[];
}

export interface ResolvedBlock {
  op: ImpexOperation;
  itemType: string;
  columns: ResolvedColumn[];
  csv?: ResolvedCsv;
  rows: string[][];
}

export interface ResolvedLoadSheet {
  name: string;
  direction: Direction;
  intent?: string;
  basedOnTemplateId?: string;
  /** Only the macros the script actually uses, in library order. */
  macros: [string, string][];
  blocks: ResolvedBlock[];
  /** How an export picks its rows. Absent on an import. */
  export?: ExportSelection;
}

export interface ResolveContext {
  catalogue: Catalogue;
  templates: LibraryTemplate[];
}

/** Fallback heading for an attribute the library has no wording for: `metaKeywords` -> `Meta Keywords`. */
export function humaniseAttribute(name: string): string {
  return name
    .replace(/^[$&]/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

/**
 * Which of an attribute's shapes to write.
 *
 * The caller's choice first; then the shape used by the template this sheet is
 * based on; only then the shape WOSG writes most often. The middle step is what
 * keeps `[mode=append]` on an append sheet: the plain form of the same
 * attribute is more common across the library, so the most-used shape would
 * quietly turn an append into an overwrite.
 */
function chooseVariant(
  entry: ReturnType<Catalogue['find']>,
  wanted: string | undefined,
  fromBase: string | undefined,
) {
  if (!entry) return undefined;
  for (const signature of [wanted, fromBase]) {
    if (!signature) continue;
    const match = entry.variants.find((v) => v.signature === signature);
    if (match) return match;
  }
  return entry.primary;
}

function resolveColumn(
  spec: SpecColumn,
  itemType: string,
  context: ResolveContext,
  baseShapes: Map<string, string>,
): ResolvedColumn {
  const entry = context.catalogue.find(itemType, spec.name);
  const variant = chooseVariant(entry, spec.variant, baseShapes.get(spec.name.toLowerCase()));

  // The library's shape is the starting point; the specification may override
  // the qualifier or the modifiers, and that is the only route by which
  // anything not seen in a real script can reach a header line.
  const base: ImpexColumn = variant
    ? { ...variant.column, raw: undefined, modifiers: [...variant.column.modifiers] }
    : { kind: spec.kind, name: spec.name, modifiers: [] };

  const column: ImpexColumn = {
    kind: spec.kind,
    name: spec.name,
    ...(spec.qualifier !== undefined
      ? { qualifier: spec.qualifier }
      : base.qualifier !== undefined
        ? { qualifier: base.qualifier }
        : {}),
    modifiers: spec.modifiers ?? base.modifiers,
  };

  const known = entry !== undefined && spec.unverified !== true;
  const label =
    spec.csvLabel ??
    variant?.labels[0]?.label ??
    entry?.variants.flatMap((v) => v.labels)[0]?.label ??
    humaniseAttribute(spec.name);

  return {
    source: spec,
    column,
    expression: formatColumn(column),
    label,
    // A flag the library only infers is still typed as a flag; what the
    // confidence changes is whether a bad value is an error or a warning.
    shape: fieldShape(column, entry?.boolean !== undefined),
    ...(entry?.boolean ? { boolean: entry.boolean } : {}),
    unique: isUnique(column),
    status: known ? 'known' : 'unverified',
    ...(known ? {} : { suggestions: context.catalogue.suggest(itemType, spec.name) }),
    ...(variant?.templateIds[0] ? { shapeFrom: variant.templateIds[0] } : {}),
  };
}

function headerRowFor(columns: ResolvedColumn[], layout: CsvLayout): string[] {
  const labels = columns.map((c) => c.label);
  return layout.typeColumn ? [layout.typeColumnLabel, ...labels] : labels;
}

/**
 * The shape the base template writes each of its columns in, by attribute name.
 *
 * First occurrence wins. A localized field appears twice in the sheets that
 * carry both languages - `name[lang=$lang]` then `name[lang=$lang2]` - and WOSG
 * always writes the primary language first, so taking the last would quietly
 * produce a sheet that writes only the US text.
 */
function shapesFromBaseTemplate(base: LibraryTemplate | undefined, itemType: string): Map<string, string> {
  const block = base?.blocks.find((b) => b.itemType.toLowerCase() === itemType.toLowerCase());
  const shapes = new Map<string, string>();
  for (const column of block?.columns ?? []) {
    const key = column.name.toLowerCase();
    if (!shapes.has(key)) shapes.set(key, formatColumn(column));
  }
  return shapes;
}

function resolveBlock(block: SpecBlock, context: ResolveContext, base: LibraryTemplate | undefined): ResolvedBlock {
  const baseShapes = shapesFromBaseTemplate(base, block.itemType);
  const columns = block.columns.map((column) => resolveColumn(column, block.itemType, context, baseShapes));
  return {
    op: block.op,
    itemType: block.itemType,
    columns,
    ...(block.csv ? { csv: { ...block.csv, headerRow: headerRowFor(columns, block.csv.layout) } } : {}),
    rows: block.rows ?? [],
  };
}

/**
 * Macro definitions for the script.
 *
 * The specification carries any the caller set explicitly; anything still
 * referenced and undefined is filled from the template the sheet is based on,
 * and failing that from the definition the library uses most often. A macro
 * nothing references is dropped, so a two-column sheet does not carry the
 * master sheet's preamble.
 */
function resolveMacros(spec: LoadSheetSpec, columns: ImpexColumn[], context: ResolveContext): [string, string][] {
  const base = context.templates.find((t) => t.id === spec.basedOnTemplateId);
  const available: Record<string, string> = { ...spec.macros };

  // Pull in definitions for anything referenced but undeclared, following
  // references inside those definitions too ($catalogVersion needs $productCatalog).
  for (let pass = 0; pass < 5; pass++) {
    const referenced = new Set<string>();
    const texts = [...columns.map((c) => c.raw ?? formatColumn(c)), ...Object.values(available)];
    for (const text of texts) {
      for (const match of text.matchAll(/\$([A-Za-z_][A-Za-z0-9_]*)/g)) referenced.add(match[1]!);
    }
    const missing = [...referenced].filter((name) => !(name in available));
    if (missing.length === 0) break;
    for (const name of missing) {
      const fromBase = base?.macros[name];
      const fromLibrary = context.catalogue.macros.find((m) => m.name === name)?.definition;
      const definition = fromBase ?? fromLibrary;
      if (definition === undefined) break;
      available[name] = definition;
    }
    if (missing.every((name) => !(name in available))) break;
  }

  const needed = requiredMacros(columns, available);
  // Declaration order follows the base template where there is one, so a
  // generated preamble reads like the ones WOSG already has - but a macro is
  // always declared after the macros it references, because ImpEx substitutes
  // them in the order they are read and a forward reference is not resolved.
  const preferred = base ? Object.keys(base.macros) : context.catalogue.macros.map((m) => m.name);
  const rank = (name: string): number => {
    const index = preferred.indexOf(name);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };
  const remaining = [...needed].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  const ordered: string[] = [];
  while (remaining.length > 0) {
    const index = remaining.findIndex((name) =>
      [...(available[name] ?? '').matchAll(/\$([A-Za-z_][A-Za-z0-9_]*)/g)].every(
        (match) => !remaining.includes(match[1]!) || match[1] === name,
      ),
    );
    // A cycle cannot be ordered; declare what is left as it stands rather than looping.
    const next = index === -1 ? 0 : index;
    ordered.push(remaining[next]!);
    remaining.splice(next, 1);
  }
  return ordered.map((name) => [name, available[name]!]);
}

export function resolveSpec(spec: LoadSheetSpec, context: ResolveContext): ResolvedLoadSheet {
  const base = context.templates.find((t) => t.id === spec.basedOnTemplateId);
  const blocks = spec.blocks.map((block) => resolveBlock(block, context, base));
  const columns = blocks.flatMap((b) => b.columns.map((c) => c.column));
  return {
    name: spec.name,
    direction: spec.direction,
    ...(spec.intent ? { intent: spec.intent } : {}),
    ...(spec.basedOnTemplateId ? { basedOnTemplateId: spec.basedOnTemplateId } : {}),
    macros: resolveMacros(spec, columns, context),
    blocks,
    ...(spec.export ? { export: spec.export } : {}),
  };
}

/** Parse a column expression into a specification column, for the paths that start from text. */
export function specColumnFromExpression(expression: string): SpecColumn {
  const parsed = parseColumn(expression);
  return {
    kind: parsed.kind,
    name: parsed.name,
    ...(parsed.qualifier !== undefined ? { qualifier: parsed.qualifier } : {}),
    ...(parsed.modifiers.length ? { modifiers: parsed.modifiers } : {}),
  };
}
