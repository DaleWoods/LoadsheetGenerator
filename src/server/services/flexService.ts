/**
 * One description, one checked query (§ Queries tab).
 *
 * The step between the model and the screen: nulls come off the schema, the
 * specification is checked against WOSG's own query library, and only then is
 * any SQL written. Nothing here trusts the model's spelling of a field.
 */

import { formatFlexQuery, type Condition, type FlexQuery } from '../../shared/flex.js';
import { flexLibrary } from '../library/flexLibrary.js';
import { validateFlexQuery, type FlexFinding } from '../domain/flexValidate.js';
import type { FlexResolution, FlexResolver } from '../integrations/flexResolver.js';

export interface FlexResult {
  name: string;
  kind: 'reporting' | 'export';
  query: string;
  spec: FlexQuery;
  summary: string;
  notes: string[];
  clarification?: string;
  findings: FlexFinding[];
}

/** The schema makes every field required and nullable; this puts it back. */
function condition(raw: FlexResolution['where'][number]): Condition {
  return {
    alias: raw.alias,
    field: raw.field,
    op: raw.op,
    ...(raw.value !== null && raw.value !== undefined ? { value: raw.value } : {}),
    ...(raw.values !== null && raw.values !== undefined && raw.values.length > 0 ? { values: raw.values } : {}),
    ...(raw.column ? { column: { alias: raw.column.alias, field: raw.column.field } } : {}),
  };
}

export function specFrom(resolution: FlexResolution): FlexQuery {
  return {
    kind: resolution.kind,
    ...(resolution.distinct ? { distinct: true } : {}),
    from: resolution.from,
    ...(resolution.joins.length > 0
      ? {
          joins: resolution.joins.map((join) => ({
            type: join.type,
            alias: join.alias,
            ...(join.left ? { left: true } : {}),
            on: join.on.map(condition),
          })),
        }
      : {}),
    select: resolution.select.map((column) => ({
      alias: column.alias,
      field: column.field,
      ...(column.label ? { label: column.label } : {}),
    })),
    ...(resolution.where.length > 0 ? { where: resolution.where.map(condition) } : {}),
    ...(resolution.orderBy.length > 0
      ? { orderBy: resolution.orderBy.map((o) => ({ alias: o.alias, field: o.field, direction: o.direction })) }
      : {}),
  };
}

export async function describeQuery(
  description: string,
  resolve: FlexResolver,
  today = new Date().toISOString().slice(0, 10),
): Promise<FlexResult> {
  const library = flexLibrary();
  const { resolution } = await resolve({ description, library, today });

  // A question back means there is nothing to write yet; the shape it needs is
  // one this app does not carry, and saying so beats a query that half does it.
  if (resolution.clarification && resolution.select.length === 0) {
    return {
      name: resolution.name,
      kind: resolution.kind,
      query: '',
      spec: { kind: resolution.kind, from: resolution.from, select: [] },
      summary: resolution.summary,
      notes: resolution.notes,
      clarification: resolution.clarification,
      findings: [],
    };
  }

  const spec = specFrom(resolution);
  return {
    name: resolution.name,
    kind: resolution.kind,
    query: formatFlexQuery(spec),
    spec,
    summary: resolution.summary,
    notes: resolution.notes,
    ...(resolution.clarification ? { clarification: resolution.clarification } : {}),
    findings: validateFlexQuery(spec, library),
  };
}
