/**
 * What kind of value a column expects.
 *
 * Worked out from the column expression itself rather than from a list of
 * attribute names, because the modifiers are the evidence: `[map-delimiter=|]`
 * is a map wherever it appears, `[mode=append]` is a collection, `[lang=$lang]`
 * is localized. The one exception is boolean, which an ImpEx column does not
 * announce -- that comes from the library, where an attribute WOSG loads with
 * TRUE/FALSE has been seen doing so.
 */

import { findModifier, hasModifier, type ImpexColumn } from './impex.js';

export type FieldType =
  | 'string'
  | 'boolean'
  | 'number'
  | 'date'
  | 'reference'
  | 'collection'
  | 'map'
  | 'macro'
  | 'documentId';

export interface FieldShape {
  type: FieldType;
  /** Written per language: the column carries a `lang=` modifier. */
  localized: boolean;
  /** For collections: whether this column adds to or takes away from the existing values. */
  mode?: 'append' | 'remove';
}

const BOOLEAN_DEFAULTS = new Set(['true', 'false']);

/** True when the column's own `[default=...]` says the field is a flag. */
export function looksBoolean(column: ImpexColumn): boolean {
  const value = findModifier(column, 'default');
  return value !== undefined && BOOLEAN_DEFAULTS.has(value.trim().replace(/['"]/g, '').toLowerCase());
}

export function fieldShape(column: ImpexColumn, knownBoolean = false): FieldShape {
  if (column.kind === 'macro') return { type: 'macro', localized: false };
  if (column.kind === 'documentId') return { type: 'documentId', localized: false };

  const localized = hasModifier(column, 'lang');
  const mode = findModifier(column, 'mode')?.trim().toLowerCase();
  const asMode = mode === 'append' || mode === 'remove' ? (mode as 'append' | 'remove') : undefined;

  if (hasModifier(column, 'map-delimiter')) return { type: 'map', localized, ...(asMode ? { mode: asMode } : {}) };
  if (asMode || hasModifier(column, 'collection-delimiter')) {
    return { type: 'collection', localized, ...(asMode ? { mode: asMode } : {}) };
  }
  if (hasModifier(column, 'dateformat')) return { type: 'date', localized };
  if (knownBoolean || looksBoolean(column)) return { type: 'boolean', localized };
  if (hasModifier(column, 'numberformat')) return { type: 'number', localized };
  if (column.qualifier !== undefined) return { type: 'reference', localized };
  return { type: 'string', localized };
}

/** The values a boolean column may hold. WOSG writes them in capitals. */
export const BOOLEAN_TRUE = 'TRUE';
export const BOOLEAN_FALSE = 'FALSE';

/**
 * `TRUE`/`FALSE` for anything that means true or false, the empty string for an
 * empty cell (ImpEx then applies the column's default), null for a value that is
 * not a boolean at all and should be reported rather than guessed at.
 */
export function normaliseBoolean(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === '') return '';
  const lower = trimmed.toLowerCase();
  if (lower === 'true') return BOOLEAN_TRUE;
  if (lower === 'false') return BOOLEAN_FALSE;
  return null;
}
