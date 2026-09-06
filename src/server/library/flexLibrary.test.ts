import { describe, expect, it } from 'vitest';
import { flexLibrary, parseFlexLibrary } from './flexLibrary.js';

const library = flexLibrary();
const find = (type: string) => library.types.find((t) => t.type.toLowerCase() === type.toLowerCase());

describe('what the app knows about querying, read from WOSGs own queries', () => {
  it('finds the types they query most, Order first', () => {
    expect(library.types.length).toBeGreaterThan(40);
    expect(library.types[0]!.type.toLowerCase()).toBe('order');
    for (const type of ['Product', 'OrderEntry', 'OrderStatus', 'BaseStore', 'Address', 'Customer']) {
      expect(find(type), type).toBeDefined();
    }
  });

  it('knows the fields they name on a type', () => {
    const order = find('Order')!.fields.map((f) => f.toLowerCase());
    expect(order).toEqual(expect.arrayContaining(['code', 'date', 'deliveryaddress', 'status']));
    expect(find('Product')!.fields.map((f) => f.toLowerCase())).toEqual(
      expect.arrayContaining(['code', 'approvalstatus']),
    );
  });

  it('keeps the join conditions whole, not cut off at the first brace', () => {
    const join = library.joins.find(
      (j) => j.from.toLowerCase() === 'orderentry' && j.to.toLowerCase() === 'order',
    )!;
    expect(join.on).toBe('{OE:ORDER}={O:PK}');
  });

  it('keeps their note on what the approval-status PKs mean', () => {
    expect(library.notes.join(' ')).toContain('8796100493403 = Approved');
  });

  it('resolves an alias inside the query that declares it, not across the file', () => {
    // Two queries, each aliasing something different to `p`. Resolved across
    // the file, Product would be credited with a PriceRow field.
    const parsed = parseFlexLibrary(
      [
        'SELECT {p:code} FROM {Product AS p}',
        '',
        'SELECT {p:kschl} FROM {AurumPriceRow AS p}',
      ].join('\n'),
    );
    const product = parsed.types.find((t) => t.type === 'Product')!;
    const price = parsed.types.find((t) => t.type === 'AurumPriceRow')!;
    expect(product.fields).toEqual(['code']);
    expect(price.fields).toEqual(['kschl']);
  });

  it('reads a query whose own lines are separated by blank lines', () => {
    // Which is how the whole library is formatted, and reading it as
    // blank-line-separated blocks left every query without its FROM.
    const parsed = parseFlexLibrary(
      ["SELECT {P:CODE} 'Article'", '', 'FROM { PRODUCT AS P', '', '}', '', "WHERE {P:CODE} LIKE '17%'"].join('\n'),
    );
    expect(parsed.types.find((t) => t.type === 'PRODUCT')?.fields.map((f) => f.toLowerCase())).toEqual(['code']);
  });
});
