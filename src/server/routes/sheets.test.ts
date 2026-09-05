import { beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { createApp } from '../index.js';
import { createDb } from '../db/index.js';
import { migrate } from '../db/migrate.js';
import { seedLibrary } from '../library/seedLibrary.js';
import { createUser } from '../services/userService.js';
import type { Resolver } from '../integrations/anthropic.js';

let base: string;
let cookie: string;

/** Stands in for the model so the routes can be driven without calling it. */
const resolver: Resolver = async ({ description }) => ({
  resolution: {
    itemType: 'Product',
    name: 'Editors Pick',
    operation: 'INSERT_UPDATE',
    fields: [{ attribute: 'isEditorsPick', inCatalogue: false, variant: null, why: 'the flag asked for' }],
    rows: description.includes('17331268') ? [['17331268', 'TRUE']] : null,
    clarification: null,
    summary: 'Sets isEditorsPick on Product by SKU.',
  },
  usage: { inputTokens: 0, outputTokens: 0 },
});

beforeAll(async () => {
  const db = await createDb({ driver: 'sqlite', sqliteFile: ':memory:' });
  await migrate(db);
  await seedLibrary(db);
  await createUser(db, { username: 'dale', password: 'a-good-long-password', role: 'admin' });
  const app = await createApp(db, resolver);
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  // Everything behind /api needs a session, so the tests hold one.
  const signIn = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'dale', password: 'a-good-long-password' }),
  });
  cookie = (signIn.headers.get('set-cookie') ?? '').split(';')[0]!;

  return () => new Promise<void>((resolve) => server.close(() => resolve()));
});

async function post(path: string, body: unknown): Promise<Response> {
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify(body),
  });
}

async function get(path: string): Promise<Response> {
  return fetch(`${base}${path}`, { headers: { cookie } });
}

describe('the library endpoints the picker reads', () => {
  it('lists the item types, the largest first', async () => {
    const body = (await (await get('/api/library/item-types')).json()) as {
      itemTypes: { itemType: string; attributes: number }[];
    };
    expect(body.itemTypes[0]!.itemType).toBe('Product');
    expect(body.itemTypes[0]!.attributes).toBeGreaterThan(50);
  });

  it('offers the fields for an item type, with both shapes where there are two', async () => {
    const body = (await (await get('/api/library/attributes?itemType=Product')).json()) as {
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
    expect((await get('/api/library/attributes')).status).toBe(400);
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

describe('describing a load sheet in words', () => {
  it('resolves a description into a request the generator can take', async () => {
    const body = (await (
      await post('/api/sheets/describe', { description: 'Set the editors pick flag on 17331268' })
    ).json()) as {
      request: { itemType: string; fields: { name: string }[]; rows: string[][] };
      fields: { attribute: string; known: boolean }[];
      summary: string;
      clarification: string | null;
    };
    expect(body.clarification).toBeNull();
    expect(body.request.itemType).toBe('Product');
    expect(body.request.fields).toEqual([{ name: 'isEditorsPick' }]);
    expect(body.request.rows).toEqual([['17331268', 'TRUE']]);
    expect(body.fields[0]!.known).toBe(false);
  });

  it('says whether describing is switched on at all', async () => {
    const body = (await (await get('/api/sheets/modes')).json()) as { describe: boolean };
    expect(body.describe).toBe(true);
  });

  it('turns down an empty description', async () => {
    expect((await post('/api/sheets/describe', { description: '' })).status).toBe(400);
  });
});

describe('the gate on an attribute the library does not know', () => {
  const unknown = {
    name: 'Editors Pick',
    itemType: 'Product',
    fields: [{ name: 'isEditorsPick' }],
    rows: [['17331268', 'TRUE']],
  };

  it('generates and flags it, on screen and in the script', async () => {
    const body = (await (await post('/api/sheets/preview', unknown)).json()) as {
      unverified: string[];
      impex: { content: string };
      findings: { code: string }[];
    };
    expect(body.unverified).toEqual(['isEditorsPick']);
    expect(body.impex.content).toContain('UNVERIFIED COLUMN: isEditorsPick');
    expect(body.findings.some((f) => f.code === 'column.unverified')).toBe(true);
  });

  it('refuses the download until it has been confirmed', async () => {
    const refused = await post('/api/sheets/package', unknown);
    expect(refused.status).toBe(422);
    const body = (await refused.json()) as { findings: { code: string; message: string }[] };
    expect(body.findings[0]!.code).toBe('unverified.unconfirmed');
    expect(body.findings[0]!.message).toContain('checked it exists in SAP Commerce');

    const confirmed = await post('/api/sheets/package', { ...unknown, confirmedUnverified: true });
    expect(confirmed.status).toBe(200);
    expect(confirmed.headers.get('Content-Type')).toBe('application/zip');
  });

  it('learns the attribute once the user says it imported cleanly', async () => {
    const learn = (await (await post('/api/sheets/learn', unknown)).json()) as {
      template: { id: string };
      learned: string[];
    };
    expect(learn.learned).toEqual(['isEditorsPick']);

    // And now it is a field like any other: no flag, no gate.
    const after = (await (await post('/api/sheets/preview', unknown)).json()) as { unverified: string[] };
    expect(after.unverified).toEqual([]);
    expect((await post('/api/sheets/package', unknown)).status).toBe(200);

    const attributes = (await (await get('/api/library/attributes?itemType=Product')).json()) as {
      attributes: { attribute: string }[];
    };
    expect(attributes.attributes.map((a) => a.attribute)).toContain('isEditorsPick');
  });
});
