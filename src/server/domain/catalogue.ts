/**
 * The catalogue: what the library adds up to.
 *
 * Derived from the stored templates every time they are read rather than kept
 * as a second table, so adding a template in-app immediately changes what the
 * field picker offers and what the resolver will accept. Nothing here is a
 * hand-maintained list of attributes.
 */

import { fieldShape, looksBoolean, type FieldShape } from '../../shared/fieldTypes.js';
import { formatColumn, isUnique, type ColumnKind, type ImpexColumn } from '../../shared/impex.js';
import type { Direction, HeaderBlock, LibraryTemplate } from '../../shared/library.js';

/** How sure we are that a field holds TRUE/FALSE. */
export type BooleanConfidence = 'declared' | 'observed';

export interface AttributeVariant {
  /** The column shape, and its own id: `usePngImageFormat[default=True]`. */
  signature: string;
  column: ImpexColumn;
  shape: FieldShape;
  uses: number;
  templateIds: string[];
  /** CSV headings WOSG has used for this shape, most-used first. */
  labels: { label: string; uses: number }[];
}

export interface CatalogueEntry {
  itemType: string;
  /** Attribute name, or the macro reference (`$catalogVersion`) for a macro column. */
  attribute: string;
  kind: ColumnKind;
  uses: number;
  variants: AttributeVariant[];
  /** The shape to use when the caller does not name one: the one WOSG writes most often. */
  primary: AttributeVariant;
  /**
   * Whether this field holds TRUE/FALSE, and on what evidence. `declared` means
   * a column carried `[default=True]` or `[default=False]`; `observed` means it
   * only ever appears in the simple flag-per-SKU sheets. A bad value in a
   * declared boolean is an error; in an observed one, a warning - the app
   * should not block a load sheet on an inference.
   */
  boolean?: BooleanConfidence;
  /** True where WOSG keys on this column (`code[unique=true]`). */
  keyColumn: boolean;
}

export interface ItemTypeSummary {
  itemType: string;
  templates: number;
  attributes: number;
  directions: Direction[];
}

/** A macro as WOSG declares it, so a generated preamble is written the way theirs are. */
export interface MacroDefinition {
  name: string;
  definition: string;
  uses: number;
}

export interface Catalogue {
  itemTypes: ItemTypeSummary[];
  entries: CatalogueEntry[];
  /** Macro declarations seen across the library, most-used definition first. */
  macros: MacroDefinition[];
  find(itemType: string, attribute: string): CatalogueEntry | undefined;
  forItemType(itemType: string): CatalogueEntry[];
  /** Known attribute names close enough to `attribute` to be worth a "did you mean". */
  suggest(itemType: string, attribute: string, limit?: number): string[];
}

/** A block small enough to be one of the flag-per-SKU sheets, macros aside. */
function isFlagSheet(block: HeaderBlock): boolean {
  return block.columns.filter((c) => c.kind === 'attribute').length <= 4;
}

function labelFor(block: HeaderBlock, index: number): string | null {
  return block.csvLabels?.[index] ?? null;
}

interface Accumulator {
  entry: CatalogueEntry;
  variants: Map<string, AttributeVariant & { labelCounts: Map<string, number> }>;
  booleanHint: boolean;
}

export function buildCatalogue(templates: LibraryTemplate[]): Catalogue {
  const accumulators = new Map<string, Accumulator>();
  const typeTemplates = new Map<string, Set<string>>();
  const typeDirections = new Map<string, Set<Direction>>();
  const macroUses = new Map<string, number>();

  for (const template of templates) {
    for (const [name, definition] of Object.entries(template.macros)) {
      const key = `${name}\u0000${definition}`;
      macroUses.set(key, (macroUses.get(key) ?? 0) + 1);
    }
  }

  for (const template of templates) {
    for (const block of template.blocks) {
      const seenTypes = typeTemplates.get(block.itemType) ?? new Set<string>();
      seenTypes.add(template.id);
      typeTemplates.set(block.itemType, seenTypes);
      const directions = typeDirections.get(block.itemType) ?? new Set<Direction>();
      directions.add(template.direction);
      typeDirections.set(block.itemType, directions);

      const flagSheet = isFlagSheet(block);
      block.columns.forEach((column, index) => {
        const key = `${block.itemType} ${column.name}`;
        let acc = accumulators.get(key);
        if (!acc) {
          acc = {
            entry: {
              itemType: block.itemType,
              attribute: column.name,
              kind: column.kind,
              uses: 0,
              variants: [],
              primary: undefined as unknown as AttributeVariant,
              keyColumn: false,
            },
            variants: new Map(),
            booleanHint: false,
          };
          accumulators.set(key, acc);
        }

        acc.entry.uses++;
        if (isUnique(column)) acc.entry.keyColumn = true;
        if (looksBoolean(column)) acc.entry.boolean = 'declared';
        // A field that only ever appears on its own against a SKU, in the
        // TrueFalse folders, is a flag even though the column never says so.
        if (
          column.kind === 'attribute' &&
          flagSheet &&
          /truefalse/i.test(template.sourcePath) &&
          !isUnique(column) &&
          column.qualifier === undefined
        ) {
          acc.booleanHint = true;
        }

        const signature = formatColumn(column);
        let variant = acc.variants.get(signature);
        if (!variant) {
          variant = {
            signature,
            column,
            shape: fieldShape(column),
            uses: 0,
            templateIds: [],
            labels: [],
            labelCounts: new Map(),
          };
          acc.variants.set(signature, variant);
        }
        variant.uses++;
        if (!variant.templateIds.includes(template.id)) variant.templateIds.push(template.id);
        const label = labelFor(block, index);
        if (label) variant.labelCounts.set(label, (variant.labelCounts.get(label) ?? 0) + 1);
      });
    }
  }

  const entries: CatalogueEntry[] = [];
  for (const acc of accumulators.values()) {
    // Settle the boolean confidence first: the variants' field types depend on it.
    if (!acc.entry.boolean && acc.booleanHint) acc.entry.boolean = 'observed';
    const variants = [...acc.variants.values()]
      .map((v) => ({
        signature: v.signature,
        column: v.column,
        shape: fieldShape(v.column, acc.entry.boolean !== undefined),
        uses: v.uses,
        templateIds: v.templateIds,
        labels: [...v.labelCounts.entries()]
          .map(([label, uses]) => ({ label, uses }))
          .sort((a, b) => b.uses - a.uses || a.label.localeCompare(b.label)),
      }))
      .sort((a, b) => b.uses - a.uses || a.signature.localeCompare(b.signature));
    entries.push({ ...acc.entry, variants, primary: variants[0]! });
  }
  entries.sort((a, b) => a.itemType.localeCompare(b.itemType) || a.attribute.localeCompare(b.attribute));

  const byKey = new Map(entries.map((e) => [`${e.itemType} ${e.attribute}`, e]));
  const byLowerKey = new Map(entries.map((e) => [`${e.itemType.toLowerCase()} ${e.attribute.toLowerCase()}`, e]));

  const itemTypes: ItemTypeSummary[] = [...typeTemplates.entries()]
    .map(([itemType, ids]) => ({
      itemType,
      templates: ids.size,
      attributes: entries.filter((e) => e.itemType === itemType && e.kind === 'attribute').length,
      directions: [...(typeDirections.get(itemType) ?? new Set<Direction>())].sort(),
    }))
    .sort((a, b) => b.templates - a.templates || a.itemType.localeCompare(b.itemType));

  const macros: MacroDefinition[] = [...macroUses.entries()]
    .map(([key, uses]) => {
      const [name, definition] = key.split('\u0000');
      return { name: name!, definition: definition!, uses };
    })
    .sort((a, b) => b.uses - a.uses || a.name.localeCompare(b.name));

  return {
    itemTypes,
    entries,
    macros,
    find(itemType, attribute) {
      return (
        byKey.get(`${itemType} ${attribute}`) ??
        byLowerKey.get(`${itemType.toLowerCase()} ${attribute.toLowerCase()}`)
      );
    },
    forItemType(itemType) {
      const lower = itemType.toLowerCase();
      return entries.filter((e) => e.itemType.toLowerCase() === lower);
    },

    suggest(itemType, attribute, limit = 3) {
      const lower = attribute.toLowerCase();
      const attributes = entries.filter((e) => e.kind === 'attribute');
      const candidates = attributes.filter((e) => e.itemType.toLowerCase() === itemType.toLowerCase());
      const pool = candidates.length > 0 ? candidates : attributes;
      return pool
        .map((e) => ({ attribute: e.attribute, distance: editDistance(lower, e.attribute.toLowerCase()) }))
        .filter((c) => c.distance <= nearMissBudget(lower))
        .sort((a, b) => a.distance - b.distance || a.attribute.localeCompare(b.attribute))
        .slice(0, limit)
        .map((c) => c.attribute);
    },
  };
}

/**
 * How far from a known name still counts as a typo. Short names get one edit,
 * long ones a little more - generous enough to catch `seeMoreStyle` for
 * `seeMoreStyles`, tight enough that `isEditorsPick` is treated as new rather
 * than being read as something else.
 */
function nearMissBudget(name: string): number {
  if (name.length <= 6) return 1;
  if (name.length <= 12) return 2;
  return 3;
}

export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const previous = new Array<number>(b.length + 1);
  const current = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) previous[j] = j;
  for (let i = 1; i <= a.length; i++) {
    current[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + cost);
    }
    for (let j = 0; j <= b.length; j++) previous[j] = current[j]!;
  }
  return previous[b.length]!;
}
