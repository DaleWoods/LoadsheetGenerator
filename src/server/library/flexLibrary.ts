/**
 * What the app knows about querying SAP Commerce: read out of WOSG's own
 * query library, not written by hand.
 *
 * `docs/wosg-flexisearch-queries.md` is 82 queries the team has actually run in
 * the backoffice console. Parsed, it gives the item types they query, the
 * fields they name on each, and which types they join to which - which is the
 * whole evidence base for checking a generated query, exactly as the 109 load
 * sheets are for a generated ImpEx.
 *
 * Aliases are resolved inside the query that declares them. Resolving them
 * across the file put `{o:code}` on PriceRow because some other query had
 * aliased something else to `o`, and a catalogue built that way would call a
 * good field unknown and a bad one fine.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export interface FlexTypeKnowledge {
  type: string;
  /** Field names as WOSG spell them, one canonical casing each. */
  fields: string[];
  /** How often the type is queried, for ordering and for the prompt. */
  uses: number;
}

export interface FlexJoinKnowledge {
  /** "Order -> Address", lower-cased, as a key. */
  from: string;
  to: string;
  /** The condition as they write it, for the prompt to copy. */
  on: string;
  uses: number;
}

export interface FlexLibrary {
  types: FlexTypeKnowledge[];
  joins: FlexJoinKnowledge[];
  /** Their notes about enum PKs, kept as prose for the prompt. */
  notes: string[];
}

function sourceFile(): string {
  return fileURLToPath(new URL('../../../docs/wosg-flexisearch-queries.md', import.meta.url));
}

/** The markdown has escaped angle brackets and inline links from the export. */
function clean(raw: string): string {
  return raw.replace(/\\([<>|_*])/g, '$1').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
}

/**
 * One query is a line-initial SELECT and everything up to the next one.
 *
 * Not blank-line separated: the export they came from put a blank line between
 * almost every line, so a query's own FROM and WHERE sit in different
 * paragraphs. Splitting on blank lines gave 82 fragments that each began with
 * SELECT and carried no FROM, so no alias resolved and the catalogue came out
 * nearly empty.
 */
function queryBlocks(text: string): string[] {
  return text
    .split(/\n(?=\s*select\b)/i)
    .map((block) => block.trim())
    .filter((block) => /^select\b/i.test(block));
}

export function parseFlexLibrary(raw: string): FlexLibrary {
  const text = clean(raw);
  const types = new Map<string, { type: string; fields: Map<string, string>; uses: number }>();
  const joins = new Map<string, FlexJoinKnowledge>();

  for (const block of queryBlocks(text)) {
    // Aliases belong to this query alone.
    const alias = new Map<string, string>();
    for (const m of block.matchAll(/\b([A-Za-z][A-Za-z0-9_]*)\s+AS\s+([A-Za-z][A-Za-z0-9_]*)/gi)) {
      alias.set(m[2]!.toLowerCase(), m[1]!);
    }
    // A query with no alias at all still names its type: `FROM {Product}`.
    for (const m of block.matchAll(/\bFROM\s*\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}/gi)) {
      alias.set('', m[1]!);
    }

    const seen = new Set<string>();
    for (const [, type] of alias) {
      const key = type.toLowerCase();
      if (!types.has(key)) types.set(key, { type, fields: new Map(), uses: 0 });
      if (!seen.has(key)) {
        types.get(key)!.uses += 1;
        seen.add(key);
      }
    }

    for (const m of block.matchAll(/\{\s*([A-Za-z][A-Za-z0-9_]*)?\s*[:.]?\s*([A-Za-z][A-Za-z0-9_]*)\s*\}/g)) {
      const owner = alias.get((m[1] ?? '').toLowerCase());
      const field = m[2]!;
      // `AS`, `ON` and the like turn up inside braces in their formatting.
      if (!owner || /^(as|on|and|or|not|null|is|from|where)$/i.test(field)) continue;
      const entry = types.get(owner.toLowerCase());
      if (!entry) continue;
      // First spelling wins, so a field is offered as it is usually written.
      if (!entry.fields.has(field.toLowerCase())) entry.fields.set(field.toLowerCase(), field);
    }

    // The ON runs to the next JOIN, the end of the FROM block, or a WHERE -
    // not to the first `}`, which is the end of its own first field reference.
    for (const m of block.matchAll(
      /\bJOIN\s+([A-Za-z][A-Za-z0-9_]*)\s+AS\s+([A-Za-z][A-Za-z0-9_]*)\s+ON\s+([\s\S]+?)(?=(?:LEFT\s+)?JOIN\b|\bWHERE\b|\bORDER\s+BY\b|\n\s*\}|$)/gi,
    )) {
      const [, toType, , on] = m;
      const fromType = alias.get('') ?? [...alias.values()][0];
      if (!fromType || !toType) continue;
      const key = `${fromType.toLowerCase()}->${toType.toLowerCase()}`;
      const existing = joins.get(key);
      if (existing) existing.uses += 1;
      else joins.set(key, { from: fromType, to: toType, on: on!.trim().replace(/\s+/g, ' '), uses: 1 });
    }
  }

  // Their own notes on the PKs that stand for enum values.
  const notes = [...text.matchAll(/^([0-9]{10,}\s*=\s*.+)$/gm)].map((m) => m[1]!.trim());

  return {
    types: [...types.values()]
      .map((t) => ({ type: t.type, fields: [...t.fields.values()].sort(), uses: t.uses }))
      .sort((a, b) => b.uses - a.uses || a.type.localeCompare(b.type)),
    joins: [...joins.values()].sort((a, b) => b.uses - a.uses),
    notes: [...new Set(notes)],
  };
}

let cached: FlexLibrary | undefined;
export function flexLibrary(): FlexLibrary {
  cached ??= parseFlexLibrary(readFileSync(sourceFile(), 'utf8'));
  return cached;
}
