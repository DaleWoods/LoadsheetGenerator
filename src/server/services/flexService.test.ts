/**
 * The two requests Dale asked for, end to end with a stand-in for the model.
 * What is being tested is everything between the model and the console: that a
 * specification becomes the query WOSG would write, and that a bad one is
 * caught rather than pasted.
 */

import { describe, expect, it } from 'vitest';
import { describeQuery } from './flexService.js';
import type { FlexResolution, FlexResolver } from '../integrations/flexResolver.js';

function answering(resolution: Partial<FlexResolution>): FlexResolver {
  return async () => ({
    resolution: {
      kind: 'reporting',
      name: 'Test Query',
      distinct: false,
      from: { type: 'Order', alias: 'o' },
      joins: [],
      select: [],
      where: [],
      groupBy: [],
      having: null,
      orderBy: [],
      clarification: null,
      summary: 'A test.',
      notes: [],
      ...resolution,
    } as FlexResolution,
  });
}

/** A selected column, with the nulls the schema requires. */
const col = (alias: string, field: string, label: string | null = null, aggregate: 'count' | 'sum' | null = null) => ({
  alias,
  field,
  label,
  aggregate,
});

const cond = (alias: string, field: string, op: FlexResolution['where'][number]['op'], value: string | null = null) => ({
  alias,
  field,
  op,
  value,
  values: null,
  column: null,
});

describe('“all orders from the last week with the order number and date”', () => {
  it('writes the query WOSG would write', async () => {
    const out = await describeQuery(
      'provide me with a query to capture all orders from the last week containing the order number and date column',
      answering({
        name: 'Orders Last Week',
        select: [col('o', 'code', 'Order Number'), col('o', 'date', 'Date')],
        where: [
          cond('o', 'date', 'gte', '2026-08-30 00:00:00'),
          cond('o', 'date', 'lte', '2026-09-06 00:00:00'),
        ],
        orderBy: [{ alias: 'o', field: 'date', direction: 'desc' }],
        notes: ['Last week read as 30 August to 6 September.'],
      }),
      '2026-09-06',
    );

    expect(out.query).toBe(
      "SELECT {o:code} 'Order Number', {o:date} 'Date' FROM {Order AS o} " +
        "WHERE {o:date} >= '2026-08-30 00:00:00' AND {o:date} <= '2026-09-06 00:00:00' " +
        'ORDER BY {o:date} DESC',
    );
    expect(out.findings).toEqual([]);
  });
});

describe('“an export query that pulls all categories with type Watches”', () => {
  it('selects the PK and nothing else, because that is what an export takes', async () => {
    const out = await describeQuery(
      'provide me with an export query that pulls all categories with type Watches',
      answering({
        kind: 'export',
        name: 'Watches Categories Export',
        from: { type: 'Category', alias: 'c' },
        select: [col('c', 'pk')],
        where: [cond('c', 'code', 'eq', 'Watches')],
      }),
    );

    expect(out.query).toBe("SELECT {c:pk} FROM {Category AS c} WHERE {c:code} = 'Watches'");
    expect(out.findings.filter((f) => f.severity === 'error')).toEqual([]);
  });

  it('refuses an export that selects display columns instead of the PK', async () => {
    // The mistake that makes an export run and write nothing - the same one
    // that cost a HAC round trip on the load sheet side.
    const out = await describeQuery(
      'export the categories',
      answering({
        kind: 'export',
        from: { type: 'Category', alias: 'c' },
        select: [col('c', 'code', 'Code')],
      }),
    );
    expect(out.findings.find((f) => f.code === 'flex.exportSelect')).toMatchObject({ severity: 'error' });
  });
});

describe('counting and grouping', () => {
  it('writes "how many orders per store last week" the way their queries write it', async () => {
    const out = await describeQuery(
      'how many orders per store last week',
      answering({
        name: 'Orders Per Store',
        joins: [
          {
            type: 'BaseStore',
            alias: 'bs',
            left: false,
            on: [{ alias: 'o', field: 'store', op: 'eq', value: null, values: null, column: { alias: 'bs', field: 'pk' } }],
          },
        ],
        select: [col('bs', 'uid', 'Store'), col('o', 'pk', 'Orders', 'count')],
        where: [cond('o', 'date', 'gte', '2026-08-31 00:00:00')],
        groupBy: [{ alias: 'bs', field: 'uid' }],
        orderBy: [{ alias: 'bs', field: 'uid', direction: 'asc' }],
      }),
    );

    // COUNT(*) with `as` before its heading, and a plain column without -
    // both copied from their library rather than made consistent.
    expect(out.query).toBe(
      "SELECT {bs:uid} 'Store', COUNT(*) as 'Orders' " +
        'FROM {Order AS o JOIN BaseStore AS bs ON {o:store} = {bs:pk}} ' +
        "WHERE {o:date} >= '2026-08-31 00:00:00' GROUP BY {bs:uid} ORDER BY {bs:uid}",
    );
    expect(out.findings).toEqual([]);
  });

  it('carries a condition on the count itself', async () => {
    const out = await describeQuery(
      'stores with more than 10 orders',
      answering({
        joins: [
          {
            type: 'BaseStore',
            alias: 'bs',
            left: false,
            on: [{ alias: 'o', field: 'store', op: 'eq', value: null, values: null, column: { alias: 'bs', field: 'pk' } }],
          },
        ],
        select: [col('bs', 'uid', 'Store'), col('o', 'pk', 'Orders', 'count')],
        groupBy: [{ alias: 'bs', field: 'uid' }],
        having: { aggregate: 'count', op: 'gt', value: '10' },
      }),
    );
    expect(out.query).toContain('GROUP BY {bs:uid} HAVING COUNT(*) > 10');
    expect(out.findings).toEqual([]);
  });

  it('refuses a count with a column beside it that is not grouped by', async () => {
    // "Orders per store" with the order code still selected returns one row
    // per order, each counted 1. It reads like an answer and is not one.
    const out = await describeQuery(
      'how many orders per store',
      answering({
        select: [col('o', 'code', 'Order'), col('o', 'pk', 'Orders', 'count')],
        groupBy: [],
      }),
    );
    const finding = out.findings.find((f) => f.code === 'flex.notGrouped')!;
    expect(finding.severity).toBe('error');
    expect(finding.message).toContain('{o:code}');
  });

  it('refuses to count in an export, which has to return items', async () => {
    const out = await describeQuery(
      'export a count of products',
      answering({
        kind: 'export',
        from: { type: 'Product', alias: 'p' },
        select: [col('p', 'pk', null, 'count')],
      }),
    );
    expect(out.findings.find((f) => f.code === 'flex.exportAggregate')).toMatchObject({ severity: 'error' });
  });
});

describe('the checks between the model and the console', () => {
  it('flags a field WOSG have never queried, and offers the near miss', async () => {
    const out = await describeQuery(
      'orders by their number',
      answering({ select: [col('o', 'code', 'Code')], where: [cond('o', 'cod', 'eq', 'X')] }),
    );
    const finding = out.findings.find((f) => f.code === 'flex.unknownField')!;
    expect(finding.severity).toBe('warning');
    expect(finding.message).toContain('Did you mean');
    expect(finding.message.toLowerCase()).toContain('code');
  });

  it('catches an alias the query never declares', async () => {
    const out = await describeQuery(
      'orders and their store',
      answering({ select: [col('bs', 'uid', 'Store')] }),
    );
    expect(out.findings.find((f) => f.code === 'flex.unknownAlias')).toMatchObject({ severity: 'error' });
  });

  it('warns on a PK written into a condition, because it is a different row elsewhere', async () => {
    const out = await describeQuery(
      'approved products',
      answering({
        from: { type: 'Product', alias: 'p' },
        select: [col('p', 'code', 'SKU')],
        where: [cond('p', 'approvalstatus', 'eq', '8796100493403')],
      }),
    );
    expect(out.findings.find((f) => f.code === 'flex.pkValue')).toMatchObject({ severity: 'warning' });
  });

  it('passes a question back rather than half-writing a query it cannot shape', async () => {
    const out = await describeQuery(
      'orders whose total beats the average for their store',
      answering({ select: [], clarification: 'That needs a subselect, which this app does not write. Shall I list the orders with their totals instead?' }),
    );
    expect(out.query).toBe('');
    expect(out.clarification).toContain('subselect');
  });
});
