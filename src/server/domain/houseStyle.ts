/**
 * What a load sheet for an item type looks like when nothing in particular
 * matches.
 *
 * A request for a field the library has never seen has nothing to be close to,
 * and the closest template by overlap is then whichever one sorted first - so
 * its trailing `$supercategories` would follow the new sheet home. Instead the
 * shape comes from what most scripts for that item type do: the key they open
 * with, and the macro columns they close with. Still taken from the library,
 * just from all of it rather than from one arbitrary member.
 */

import { formatColumn, isUnique, type ImpexColumn } from '../../shared/impex.js';
import type { Direction, LibraryTemplate } from '../../shared/library.js';

export interface HouseStyle {
  /** Columns up to and including the key: `code[unique=true]`, or the variant pair. */
  key: ImpexColumn[];
  /** Macro columns the script ends with, most commonly `$catalogVersion`. */
  trailingMacros: ImpexColumn[];
}

function keyPrefix(columns: ImpexColumn[]): ImpexColumn[] {
  const lastUnique = columns.reduce((last, column, index) => (isUnique(column) ? index : last), -1);
  return lastUnique === -1 ? [] : columns.slice(0, lastUnique + 1);
}

function trailingMacros(columns: ImpexColumn[]): ImpexColumn[] {
  const macros: ImpexColumn[] = [];
  for (let i = columns.length - 1; i >= 0; i--) {
    const column = columns[i]!;
    if (column.kind !== 'macro') break;
    macros.unshift(column);
  }
  return macros;
}

function mostCommon(groups: ImpexColumn[][]): ImpexColumn[] {
  const counts = new Map<string, { columns: ImpexColumn[]; uses: number }>();
  for (const group of groups) {
    const key = group.map(formatColumn).join(';');
    const existing = counts.get(key);
    if (existing) existing.uses++;
    else counts.set(key, { columns: group, uses: 1 });
  }
  const ranked = [...counts.values()].sort((a, b) => b.uses - a.uses || b.columns.length - a.columns.length);
  return ranked[0]?.columns ?? [];
}

export function houseStyle(templates: LibraryTemplate[], itemType: string, direction: Direction): HouseStyle {
  const blocks = templates
    .filter((t) => t.direction === direction)
    .flatMap((t) => t.blocks)
    .filter((b) => b.itemType.toLowerCase() === itemType.toLowerCase());

  return {
    key: mostCommon(blocks.map((b) => keyPrefix(b.columns)).filter((k) => k.length > 0)),
    trailingMacros: mostCommon(blocks.map((b) => trailingMacros(b.columns)).filter((m) => m.length > 0)),
  };
}
