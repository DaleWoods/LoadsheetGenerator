/**
 * Checking a query specification before it becomes text (§ Queries tab).
 *
 * A query only reads, so a wrong one costs an error message rather than
 * corrupted data - the checks here are deliberately lighter than the ones a
 * load sheet gets. What they are not is absent: a query that runs and returns
 * plausible but wrong rows is how a bad decision gets made, and how a bad load
 * sheet gets built from its output.
 *
 * Everything is checked against `docs/wosg-flexisearch-queries.md`, so "known"
 * means WOSG have queried it, not that it exists in SAP Commerce. An unknown
 * name generates and is flagged, the same bargain the load sheet side strikes.
 */

import { aliasesOf, fieldRefsOf, type FlexQuery } from '../../shared/flex.js';
import type { FlexLibrary } from '../library/flexLibrary.js';

export interface FlexFinding {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
}

/** Edit distance, for "did you mean" rather than a silent substitution. */
function distance(a: string, b: string): number {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) rows[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      rows[i]![j] = Math.min(
        rows[i - 1]![j]! + 1,
        rows[i]![j - 1]! + 1,
        rows[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return rows[a.length]![b.length]!;
}

function closest(name: string, candidates: string[]): string[] {
  const limit = name.length <= 5 ? 1 : 2;
  return candidates
    .map((candidate) => ({ candidate, d: distance(name.toLowerCase(), candidate.toLowerCase()) }))
    .filter((x) => x.d > 0 && x.d <= limit)
    .sort((a, b) => a.d - b.d)
    .slice(0, 2)
    .map((x) => x.candidate);
}

export function validateFlexQuery(query: FlexQuery, library: FlexLibrary): FlexFinding[] {
  const findings: FlexFinding[] = [];
  const add = (f: FlexFinding): void => {
    findings.push(f);
  };

  const declared = aliasesOf(query);
  const byAlias = new Map(declared.map((d) => [d.alias.toLowerCase(), d.type]));
  const typeNames = library.types.map((t) => t.type);

  // An alias used but never declared is a join the model forgot to write, and
  // the query will not parse.
  for (const ref of fieldRefsOf(query)) {
    if (!byAlias.has(ref.alias.toLowerCase())) {
      add({
        severity: 'error',
        code: 'flex.unknownAlias',
        message: `{${ref.alias}:${ref.field}} uses "${ref.alias}", which nothing in the query declares. The types it does declare are ${declared.map((d) => `${d.alias} (${d.type})`).join(', ')}.`,
      });
    }
  }

  for (const { alias, type } of declared) {
    const known = library.types.find((t) => t.type.toLowerCase() === type.toLowerCase());
    if (!known) {
      const near = closest(type, typeNames);
      add({
        severity: 'warning',
        code: 'flex.unknownType',
        message:
          `${type} is not a type WOSG have queried before, so the app cannot check the fields on it.` +
          (near.length > 0 ? ` Did you mean ${near.join(' or ')}?` : ''),
      });
      continue;
    }
    const fields = new Set(known.fields.map((f) => f.toLowerCase()));
    for (const ref of fieldRefsOf(query)) {
      if (ref.alias.toLowerCase() !== alias.toLowerCase()) continue;
      // `pk` is on every item and is often not named in their queries.
      if (ref.field.toLowerCase() === 'pk') continue;
      if (fields.has(ref.field.toLowerCase())) continue;
      const near = closest(ref.field, known.fields);
      add({
        severity: 'warning',
        code: 'flex.unknownField',
        message:
          `${type} has no field "${ref.field}" in any query WOSG have run. It may still be right - the app only knows the fields they have used.` +
          (near.length > 0 ? ` Did you mean ${near.join(' or ')}?` : ''),
      });
    }
  }

  // An export query feeds exportItemsFlexibleSearch, which wants the PK of the
  // items and nothing else. Selecting display columns instead is the mistake
  // that makes an export run and write nothing.
  if (query.kind === 'export') {
    const wrong = query.select.filter((column) => column.field.toLowerCase() !== 'pk');
    if (query.select.length !== 1 || wrong.length > 0) {
      add({
        severity: 'error',
        code: 'flex.exportSelect',
        message:
          'An export query has to select one column, the PK of the items to export. This one selects ' +
          `${query.select.map((c) => `{${c.alias}:${c.field}}`).join(', ')}, which an export would not know what to do with.`,
      });
    }
  }

  // A PK identifies a different row in every environment. Their own console
  // queries are full of them; a query somebody is going to keep should not be.
  for (const condition of [...(query.where ?? []), ...(query.joins ?? []).flatMap((j) => j.on)]) {
    const values = [condition.value, ...(condition.values ?? [])].filter((v): v is string => v !== undefined);
    const pk = values.find((v) => /^\d{12,}$/.test(v.trim()));
    if (pk) {
      add({
        severity: 'warning',
        code: 'flex.pkValue',
        message: `{${condition.alias}:${condition.field}} is matched against ${pk}, which looks like a PK. PKs differ between environments, so this query will return nothing on another one. Match on the value it stands for where you can.`,
      });
    }
  }

  if (query.select.length === 0) {
    add({ severity: 'error', code: 'flex.noColumns', message: 'The query selects no columns.' });
  }

  return findings;
}
