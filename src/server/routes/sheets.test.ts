import { beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { createApp } from '../index.js';
import { createDb } from '../db/index.js';
import { migrate } from '../db/migrate.js';
import { seedLibrary } from '../library/seedLibrary.js';

let base: string;

beforeAll(async () => {
  const db = await createDb({ driver: 'sqlite', sqliteFile: ':memory:' });
  await migrate(db);
  await seedLibrary(db);
  const app = await createApp(db);
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return () => new Promise<void>((resolve) => server.close(() => resolve()));
});

async function post(path: string, body: unknown): Promise<Response> {
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('the library endpoints the picker reads', () => {
  it('lists the item types, the largest first', async () => {
    const body = (await (await fetch(`${base}/api/library/item-types`)).json()) as {
      itemTypes: { itemType: string; attributes: number }[];
    };
    expect(body.itemTypes[0]!.itemType).toBe('Product');
    expect(body.itemTypes[0]!.attributes).toBeGreaterThan(50);
  });

  it('offers the fields for an item type, with both shapes where there are two', async () => {
    const body = (await (await fetch(`${base}/api/library/attributes?itemType=Product`)).json()) as {
      attributes: { attribute: string; variants: { description: string }[]; boolean?: string }[];
    };
    const seeMoreStyles = body.attributes.find((a) => a.attribute === 'seeMoreStylesRef')!;
    expect(seeMoreStyles.variants.map((v) => v.description)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('adds to the values already there'),
        expect.stringContaining('takes values away'),
      ]),
    );
    expect(body.attributes.find((a) => a.attribute === 'usePngImageFormat')!.boolean).toBe('declared');
  });

  it('asks for an item type rather than guessing one', async () => {
    expect((await fetch(`${base}/api/library/attributes`)).status).toBe(400);
  });
});

describe('generating and downloading', () => {
  const request = {
    name: 'Use Png Image Format',
    itemType: 'Product',
    fields: [{ name: 'usePngImageFormat' }],
    rows: [['17331268', 'true']],
  };

  it('previews the script, the CSV and what to check', async () => {
    const body = (await (await post('/api/sheets/preview', request)).json()) as {
      impex: { filename: string; content: string };
      csvs: { filename: string; content: string }[];
      packageable: boolean;
      basedOn: { name: string } | null;
      columns: { expression: string; status: string }[];
    };
    expect(body.impex.filename).toBe('UsePngImageFormat.impex');
    expect(body.impex.content).toContain('INSERT_UPDATE Product;code[unique=true];usePngImageFormat[default=False]');
    expect(body.csvs[0]!.content).toContain(',17331268,TRUE,');
    expect(body.basedOn?.name).toBe('Products / TrueFalse / usePngImageFormat');
    expect(body.columns.map((c) => c.status)).toEqual(['known', 'known', 'known']);
    expect(body.packageable).toBe(true);
  });

  it('sends back a zip holding the script and its CSV', async () => {
    const response = await post('/api/sheets/package', request);
    expect(response.headers.get('Content-Type')).toBe('application/zip');
    expect(response.headers.get('Content-Disposition')).toContain('UsePngImageFormat.zip');

    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(Buffer.from(await response.arrayBuffer()));
    expect(Object.keys(zip.files).sort()).toEqual(['UsePngImageFormat.csv', 'UsePngImageFormat.impex']);
    const csv = await zip.file('UsePngImageFormat.csv')!.async('string');
    expect(csv.split('\r\n')[0]).toContain('Type (Leave Blank),SKU,');
  });

  it('refuses to package a sheet that would fail at import, and says why', async () => {
    const response = await post('/api/sheets/package', { ...request, rows: [['17331268', 'yes please']] });
    expect(response.status).toBe(422);
    const body = (await response.json()) as { findings: { code: string; message: string }[] };
    expect(body.findings[0]!.code).toBe('csv.booleanValue');
  });

  it('turns down a request that makes no sense rather than generating something', async () => {
    expect((await post('/api/sheets/preview', { itemType: 'Product', fields: [] })).status).toBe(400);
  });
});
