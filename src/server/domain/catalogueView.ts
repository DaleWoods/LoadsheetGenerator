/**
 * The catalogue, shaped for the field picker.
 *
 * The UI needs to show a person what a column will do without showing them
 * ImpEx: that a field is a flag, that it is written per language, that this
 * particular shape appends rather than replaces, and which of WOSG's own sheets
 * it came from. All of it is read off the parsed modifiers, so a shape the
 * library has never seen cannot appear in the list.
 */

import { findModifier } from '../../shared/impex.js';
import type { LibraryTemplate } from '../../shared/library.js';
import type { AttributeVariant, Catalogue, CatalogueEntry } from './catalogue.js';
import { humaniseAttribute } from './resolve.js';

export interface VariantView {
  signature: string;
  /** "appends to what is there", "written per language" - what picking it changes. */
  description: string;
  label: string;
  uses: number;
  usedIn: string[];
}

export interface AttributeView {
  attribute: string;
  label: string;
  type: string;
  localized: boolean;
  boolean?: 'declared' | 'observed';
  keyColumn: boolean;
  uses: number;
  variants: VariantView[];
  usedIn: string[];
}

export interface ItemTypeView {
  itemType: string;
  templates: number;
  attributes: number;
  directions: string[];
}

/**
 * The language a localized shape writes, as somebody would say it.
 *
 * The house convention names the languages through macros - `$lang=en`,
 * `$lang2=en_US` - so the modifier alone reads "(lang2)", which says nothing
 * about which language you are getting. Resolving it against the library's own
 * macro definitions turns that into "(en_US)". Only a plain definition is
 * followed; anything with structure in it is left as written.
 */
function languageOf(variant: AttributeVariant, macros: Map<string, string>): string | undefined {
  const lang = findModifier(variant.column, 'lang');
  if (lang === undefined) return undefined;
  if (!lang.startsWith('$')) return lang;
  const definition = macros.get(lang.slice(1));
  return definition !== undefined && /^[A-Za-z0-9_-]+$/.test(definition) ? definition : lang.replace('$', '');
}

function describeVariant(variant: AttributeVariant, macros: Map<string, string>): string {
  const parts: string[] = [];
  const mode = variant.shape.mode;
  if (mode === 'append') parts.push('adds to the values already there');
  if (mode === 'remove') parts.push('takes values away');
  if (variant.shape.localized) {
    const lang = languageOf(variant, macros);
    parts.push(lang ? `written per language (${lang})` : 'written per language');
  }
  switch (variant.shape.type) {
    case 'boolean':
      parts.push('TRUE or FALSE');
      break;
    case 'collection':
      if (!mode) parts.push('a list of values');
      break;
    case 'map':
      parts.push('key->value pairs');
      break;
    case 'reference':
      if (variant.column.qualifier) parts.push(`looked up by ${variant.column.qualifier.trim()}`);
      break;
    case 'date':
      parts.push('a date');
      break;
    default:
      break;
  }
  const fallback = findModifier(variant.column, 'default');
  if (fallback !== undefined) parts.push(`defaults to ${fallback.replace(/['"]/g, '')} when the cell is empty`);
  return parts.length > 0 ? parts.join(', ') : 'plain value';
}

function templateNames(templates: LibraryTemplate[], ids: string[], limit = 3): string[] {
  return ids
    .slice(0, limit)
    .map((id) => templates.find((t) => t.id === id)?.name ?? id)
    .filter((name) => name.length > 0);
}

function toVariantView(
  variant: AttributeVariant,
  templates: LibraryTemplate[],
  macros: Map<string, string>,
): VariantView {
  return {
    signature: variant.signature,
    description: describeVariant(variant, macros),
    label: variant.labels[0]?.label ?? '',
    uses: variant.uses,
    usedIn: templateNames(templates, variant.templateIds),
  };
}

export function toAttributeView(
  entry: CatalogueEntry,
  templates: LibraryTemplate[],
  macros: Map<string, string> = new Map(),
): AttributeView {
  const labels = entry.variants.flatMap((v) => v.labels);
  return {
    attribute: entry.attribute,
    label: labels[0]?.label ?? humaniseAttribute(entry.attribute),
    type: entry.primary.shape.type,
    localized: entry.primary.shape.localized,
    ...(entry.boolean ? { boolean: entry.boolean } : {}),
    keyColumn: entry.keyColumn,
    uses: entry.uses,
    variants: entry.variants.map((variant) => toVariantView(variant, templates, macros)),
    usedIn: templateNames(
      templates,
      entry.variants.flatMap((v) => v.templateIds),
    ),
  };
}

/**
 * The fields on offer for an item type.
 *
 * Macro columns are left out: `$catalogVersion` is not a field somebody ticks,
 * it is part of how the sheet is built, and the generator adds it. The key
 * column stays in the list but is marked, because the generator adds that too
 * and ticking it again would be a duplicate.
 */
export function attributesFor(catalogue: Catalogue, templates: LibraryTemplate[], itemType: string): AttributeView[] {
  // `catalogue.macros` holds one row per distinct definition, most-used first -
  // a handful of scripts define `$lang` as en_US - so the first row for a name
  // is the one to take. Building a Map straight from the list would keep the
  // last, which is the rarest.
  const macros = new Map<string, string>();
  for (const macro of catalogue.macros) if (!macros.has(macro.name)) macros.set(macro.name, macro.definition);
  return catalogue
    .forItemType(itemType)
    .filter((entry) => entry.kind === 'attribute')
    .map((entry) => toAttributeView(entry, templates, macros))
    .sort((a, b) => b.uses - a.uses || a.attribute.localeCompare(b.attribute));
}

export function itemTypesView(catalogue: Catalogue): ItemTypeView[] {
  return catalogue.itemTypes.map((summary) => ({
    itemType: summary.itemType,
    templates: summary.templates,
    attributes: summary.attributes,
    directions: summary.directions,
  }));
}
