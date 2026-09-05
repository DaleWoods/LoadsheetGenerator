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
    direction: 'import',
    exportSelection: null,
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
    const learn = (await (await post('/api/sheets/save', { request: unknown, imported: true })).json()) as {
      entry: { id: string; verified: boolean };
      learned: string[];
    };
    expect(learn.learned).toEqual(['isEditorsPick']);
    expect(learn.entry.verified).toBe(true);

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

describe('history', () => {
  it('records a sheet when it is downloaded, not while it is being previewed', async () => {
    const request = { name: 'History Test', itemType: 'Product', fields: [{ name: 'metaKeywords' }] };
    await post('/api/sheets/preview', request);
    await post('/api/sheets/preview', request);

    const before = (await (await get('/api/sheets/history')).json()) as { history: { name: string }[] };
    expect(before.history.filter((entry) => entry.name === 'History Test')).toHaveLength(0);

    expect((await post('/api/sheets/package', request)).status).toBe(200);
    const after = (await (await get('/api/sheets/history')).json()) as {
      history: { name: string; username: string; outcome: string; filename: string; request: unknown }[];
    };
    const entry = after.history.find((e) => e.name === 'History Test')!;
    expect(entry).toMatchObject({ username: 'dale', outcome: 'downloaded', filename: 'HistoryTest.zip' });
    // What is kept is the request, so replaying it regenerates against the
    // library as it stands then - not the files that came out today.
    expect(entry.request).toMatchObject({ itemType: 'Product', fields: [{ name: 'metaKeywords' }] });
  });

  it('does not carry the unverified confirmation into a reused request', async () => {
    // Ticking that box was a decision about one download, not part of the sheet.
    await post('/api/sheets/package', {
      name: 'Confirmed Once',
      itemType: 'Product',
      fields: [{ name: 'isNotInTheLibrary' }],
      confirmedUnverified: true,
    });
    const body = (await (await get('/api/sheets/history')).json()) as {
      history: { name: string; request: { confirmedUnverified?: boolean } }[];
    };
    const entry = body.history.find((e) => e.name === 'Confirmed Once')!;
    expect(entry.request.confirmedUnverified).toBeUndefined();
  });

  it('can be narrowed to one person', async () => {
    const mine = (await (await get('/api/sheets/history?mine=true')).json()) as { history: { username: string }[] };
    expect(mine.history.every((entry) => entry.username === 'dale')).toBe(true);
  });

  it('keeps an export in the history too, and says it was one', async () => {
    await post('/api/sheets/package', {
      name: 'Roundel Export',
      itemType: 'Product',
      fields: [{ name: 'akamaiRoundel' }],
      export: { kind: 'skuList', codes: ['17331268'] },
    });
    const body = (await (await get('/api/sheets/history')).json()) as {
      history: { name: string; direction: string; filename: string }[];
    };
    expect(body.history.find((e) => e.name === 'Roundel Export')).toMatchObject({
      direction: 'export',
      filename: 'RoundelExport.impex',
    });
  });
});

describe('the repository', () => {
  it('has the supplied export on one shelf', async () => {
    const body = (await (await get('/api/library/repository')).json()) as {
      supplied: { name: string; shelf: string; reusable: boolean; columnsOffset: number | null }[];
      saved: unknown[];
      totals: { supplied: number };
    };
    expect(body.totals.supplied).toBe(109);
    const seeMoreStyles = body.supplied.find((entry) => entry.name.includes('SeeMoreStyles / Append'))!;
    expect(seeMoreStyles).toMatchObject({ shelf: 'supplied', columnsOffset: -1 });
    // The extraction captured what each script was, never the file, so a
    // supplied record describes rather than reopens.
    expect(seeMoreStyles.reusable).toBe(false);
  });

  it('searches by what somebody would remember about a sheet', async () => {
    const byField = (await (await get('/api/library/repository?search=seeMoreStylesRef')).json()) as {
      supplied: { name: string }[];
    };
    expect(byField.supplied.length).toBeGreaterThan(0);

    const byCsv = (await (await get('/api/library/repository?search=AkamaiRoundels.csv')).json()) as {
      supplied: { csvFile: string | null }[];
    };
    expect(byCsv.supplied[0]!.csvFile).toBe('AkamaiRoundels.csv');

    const byType = (await (await get('/api/library/repository?itemType=Category')).json()) as {
      supplied: { itemTypes: string[] }[];
    };
    expect(byType.supplied.every((entry) => entry.itemTypes.includes('Category'))).toBe(true);
  });

  it('describes a supplied sheet down to the header line it used', async () => {
    const body = (await (
      await get('/api/library/repository/products-site-settings-append-importscript')
    ).json()) as {
      entry: { name: string; provenance: string };
      blocks: { headerLine: string; csvHeaderRow: string[] | null; csv: { columnsOffset: number } | null }[];
      macros: [string, string][];
      request: unknown;
    };
    expect(body.entry.provenance).toBe('Products/Site Settings/Append/importScript.impex');
    expect(body.blocks[0]!.headerLine).toContain('INSERT_UPDATE Product;code[unique=true];syncToSite(uid)[mode=append]');
    expect(body.blocks[0]!.csvHeaderRow?.[0]).toBe('Type (Leave Blank)');
    expect(body.macros.map(([name]) => name)).toContain('catalogVersion');
    expect(body.request).toBeNull();
  });

  it('puts a sheet somebody made on the other shelf, and can open it again', async () => {
    const request = { name: 'Weekly Metadata', itemType: 'Product', fields: [{ name: 'metaKeywords' }] };
    const saved = (await (
      await post('/api/sheets/save', { request, description: 'The one we run every Tuesday.' })
    ).json()) as { entry: { id: string; shelf: string; verified: boolean; reusable: boolean } };
    expect(saved.entry).toMatchObject({ shelf: 'saved', reusable: true });
    // Saved for reuse is not the same as run: it is on the shelf, but it is not
    // evidence until somebody says it imported cleanly.
    expect(saved.entry.verified).toBe(false);

    const detail = (await (await get(`/api/library/repository/${saved.entry.id}`)).json()) as {
      entry: { provenance: string; description?: string };
      request: { itemType: string; fields: { name: string }[] };
    };
    expect(detail.entry.provenance).toContain('Saved by dale');
    expect(detail.entry.description).toBe('The one we run every Tuesday.');
    expect(detail.request).toMatchObject({ itemType: 'Product', fields: [{ name: 'metaKeywords' }] });
  });

  it('does not let a saved-but-unrun sheet make an attribute look known', async () => {
    const request = { name: 'Not Run Yet', itemType: 'Product', fields: [{ name: 'someBrandNewFlag' }] };
    await post('/api/sheets/save', { request });

    const preview = (await (await post('/api/sheets/preview', request)).json()) as { unverified: string[] };
    expect(preview.unverified).toEqual(['someBrandNewFlag']);
    // And the download is still held behind the confirmation.
    expect((await post('/api/sheets/package', request)).status).toBe(422);
  });

  it('refuses to remove anything from the supplied export', async () => {
    const response = await fetch(`${base}/api/library/repository/categories-append-importscript`, {
      method: 'DELETE',
      headers: { cookie },
    });
    expect(response.status).toBe(409);
    expect((await response.json()) as { error: string }).toMatchObject({
      error: expect.stringContaining('supplied production export'),
    });
  });

  it('removes a saved one', async () => {
    const request = { name: 'Throwaway', itemType: 'Product', fields: [{ name: 'metaKeywords' }] };
    const saved = (await (await post('/api/sheets/save', { request })).json()) as { entry: { id: string } };
    const removed = await fetch(`${base}/api/library/repository/${saved.entry.id}`, {
      method: 'DELETE',
      headers: { cookie },
    });
    expect(removed.status).toBe(200);
    expect((await get(`/api/library/repository/${saved.entry.id}`)).status).toBe(404);
  });
});
