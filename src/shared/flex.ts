/**
 * A FlexibleSearch query as a structure, and how to write one out (§ new tab).
 *
 * The same rule the load sheet generator works to: what the model returns is a
 * specification, never query text. A hallucinated field name or a join to a
 * type that does not exist should have nothing to travel through - it is
 * caught against the catalogue while it is still a name in a field, before any
 * SQL is written.
 *
 * The shape here was measured against the 82 queries in
 * `docs/wosg-flexisearch-queries.md` rather than designed from the
 * FlexibleSearch grammar: select with labels (43 of them), joins (32), where
 * (32), order by (11) and distinct (10) cover almost all of their work.
 * Subselects, CASE, GROUP BY and UNION are the tail, and a request that needs
 * one is answered with a question rather than a query that does not do it.
 */

export type Comparison = 'eq' | 'ne' | 'lt' | 'lte' | 'gt' | 'gte' | 'like' | 'in' | 'notIn' | 'isNull' | 'isNotNull';

export interface FieldRef {
  alias: string;
  field: string;
}

export interface Condition extends FieldRef {
  op: Comparison;
  /** For everything but `in`/`notIn`/`isNull`/`isNotNull`. */
  value?: string;
  /** For `in` and `notIn`. */
  values?: string[];
  /**
   * Compare against another column rather than a value - `{oe:order} = {o:pk}`.
   * Set instead of `value`.
   */
  column?: FieldRef;
}

export interface SelectColumn extends FieldRef {
  /** The heading, written after the column the way their queries write it. */
  label?: string;
}

export interface Join {
  type: string;
  alias: string;
  /** LEFT JOIN when the row may legitimately have no match. */
  left?: boolean;
  on: Condition[];
}

export interface FlexQuery {
  /**
   * A reporting query is read in the console and selects the columns somebody
   * wants to see. An export query feeds `exportItemsFlexibleSearch` and has to
   * select the PK of the items to export and nothing else - two different
   * things that look alike, and mixing them up is why an export can run and
   * write nothing.
   */
  kind: 'reporting' | 'export';
  distinct?: boolean;
  from: { type: string; alias: string };
  joins?: Join[];
  select: SelectColumn[];
  /** ANDed together, as all of theirs are. */
  where?: Condition[];
  orderBy?: { alias: string; field: string; direction?: 'asc' | 'desc' }[];
}

/** FlexibleSearch takes doubled single quotes; a value carrying one is escaped, not refused. */
export function quote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function ref(r: FieldRef): string {
  return `{${r.alias}:${r.field}}`;
}

function condition(c: Condition): string {
  const left = ref(c);
  switch (c.op) {
    case 'isNull':
      return `${left} IS NULL`;
    case 'isNotNull':
      return `${left} IS NOT NULL`;
    case 'in':
    case 'notIn': {
      const list = (c.values ?? []).map(quote).join(', ');
      return `${left} ${c.op === 'in' ? 'IN' : 'NOT IN'} (${list})`;
    }
    default: {
      const ops: Record<string, string> = { eq: '=', ne: '<>', lt: '<', lte: '<=', gt: '>', gte: '>=', like: 'LIKE' };
      const right = c.column ? ref(c.column) : quote(c.value ?? '');
      return `${left} ${ops[c.op]} ${right}`;
    }
  }
}

/**
 * The query as text, in the form their own queries take: `{alias:field}` with a
 * colon (1120 uses against 173 of the dot form across their library), the type
 * and its alias inside the FROM braces, and a quoted heading after a selected
 * column.
 */
export function formatFlexQuery(query: FlexQuery): string {
  const select = query.select
    .map((column) => `${ref(column)}${column.label ? ` ${quote(column.label)}` : ''}`)
    .join(', ');

  const joins = (query.joins ?? [])
    .map((join) => {
      const on = join.on.map(condition).join(' AND ');
      return ` ${join.left ? 'LEFT JOIN' : 'JOIN'} ${join.type} AS ${join.alias} ON ${on}`;
    })
    .join('');

  const parts = [
    `SELECT ${query.distinct ? 'DISTINCT ' : ''}${select}`,
    `FROM {${query.from.type} AS ${query.from.alias}${joins}}`,
  ];
  if (query.where && query.where.length > 0) parts.push(`WHERE ${query.where.map(condition).join(' AND ')}`);
  if (query.orderBy && query.orderBy.length > 0) {
    parts.push(
      `ORDER BY ${query.orderBy
        .map((o) => `{${o.alias}:${o.field}}${o.direction === 'desc' ? ' DESC' : ''}`)
        .join(', ')}`,
    );
  }
  return parts.join(' ');
}

/** Every alias the query declares, in the order it declares them. */
export function aliasesOf(query: FlexQuery): { alias: string; type: string }[] {
  return [
    { alias: query.from.alias, type: query.from.type },
    ...(query.joins ?? []).map((join) => ({ alias: join.alias, type: join.type })),
  ];
}

/** Every field the query names, wherever it names it. */
export function fieldRefsOf(query: FlexQuery): FieldRef[] {
  const fromCondition = (c: Condition): FieldRef[] => [{ alias: c.alias, field: c.field }, ...(c.column ? [c.column] : [])];
  return [
    ...query.select.map((s) => ({ alias: s.alias, field: s.field })),
    ...(query.joins ?? []).flatMap((join) => join.on.flatMap(fromCondition)),
    ...(query.where ?? []).flatMap(fromCondition),
    ...(query.orderBy ?? []).map((o) => ({ alias: o.alias, field: o.field })),
  ];
}
