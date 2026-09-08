/**
 * The loop that runs backwards: a sheet fails in HAC, somebody says so, and
 * the next person building the same thing is told before they download it.
 *
 * Until this, only success taught the app anything. Success only confirms what
 * it already believed; a failure is the thing it did not know.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { createApp } from '../index.js';
import { createDb, type Db } from '../db/index.js';
import { migrate } from '../db/migrate.js';
import { seedLibrary } from '../library/seedLibrary.js';
import { createUser } from '../services/userService.js';
import type { Resolver } from '../integrations/anthropic.js';
import type { Finding } from '../domain/validate.js';

const resolver: Resolver = async () => {
  throw new Error('not used');
};

let base: string;
let cookie: string;
let db: Db;

const sheet = {
  name: 'Failing Sheet',
  itemType: 'Product',
  fields: [{ name: 'akamaiImageCount' }],
  rows: [['17331268', '3']],
};

async function post(path: string, body: unknown): Promise<Response> {
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  db = await createDb({ driver: 'sqlite', sqliteFile: ':memory:' });
  await migrate(db);
  await seedLibrary(db);
  await createUser(db, { username: 'dale', password: 'a-good-long-password', role: 'admin' });
  const app = await createApp(db, resolver);
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const signIn = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'dale', password: 'a-good-long-password' }),
  });
  cookie = signIn.headers.get('set-cookie')!.split(';')[0]!;
});

describe('reporting that a sheet failed', () => {
  it('warns whoever builds the same sheet next, before they download it', async () => {
    // Downloaded, so it is in the history to report against.
    expect((await post('/api/sheets/package', sheet)).status).toBe(200);
    const history = (await (await fetch(`${base}/api/sheets/history`, { headers: { cookie } })).json()) as {
      history: { id: string; outcome: string }[];
    };
    const entry = history.history[0]!;

    // Nothing to warn about yet.
    const before = (await (await post('/api/sheets/preview', sheet)).json()) as { findings: Finding[] };
    expect(before.findings.find((f) => f.code === 'history.failedBefore')).toBeUndefined();

    const reported = await post('/api/sheets/failed', {
      id: entry.id,
      note: 'unknown attribute akamaiImageCount for type Product',
    });
    expect(reported.status).toBe(200);

    const after = (await (await post('/api/sheets/preview', sheet)).json()) as { findings: Finding[] };
    const warning = after.findings.find((f) => f.code === 'history.failedBefore')!;
    expect(warning.severity).toBe('warning');
    expect(warning.message).toContain('unknown attribute akamaiImageCount');
  });

  it('does not warn on a different sheet that happens to share a field', async () => {
    // A warning that fires on everything touching a common field is one
    // nobody reads by the second week, so the match is the whole field set.
    const other = { ...sheet, name: 'Different Sheet', fields: [{ name: 'akamaiImageCount' }, { name: 'akamaiRoundel' }] };
    const out = (await (await post('/api/sheets/preview', other)).json()) as { findings: Finding[] };
    expect(out.findings.find((f) => f.code === 'history.failedBefore')).toBeUndefined();
  });

  it('shows in the history as failed, with what SAP Commerce said', async () => {
    const body = (await (await fetch(`${base}/api/sheets/history`, { headers: { cookie } })).json()) as {
      history: { outcome: string; failureNote?: string }[];
    };
    const failed = body.history.find((row) => row.outcome === 'failed')!;
    expect(failed.failureNote).toContain('unknown attribute');
  });

  it('records it in the audit log too', async () => {
    await new Promise((resolve) => setTimeout(resolve, 120));
    const body = (await (await fetch(`${base}/api/audit?action=sheet.failed`, { headers: { cookie } })).json()) as {
      events: { summary: string; detail: Record<string, unknown> }[];
    };
    expect(body.events).toHaveLength(1);
    expect(body.events[0]!.summary).toContain('reported');
    expect(body.events[0]!.detail.message).toContain('unknown attribute');
  });

  it('refuses a report against a sheet that is not in the history', async () => {
    const out = await post('/api/sheets/failed', { id: 'not-a-real-id', note: 'something went wrong' });
    expect(out.status).toBe(404);
  });
});
