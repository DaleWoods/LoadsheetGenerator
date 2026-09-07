/**
 * The audit log, end to end: an action taken through the API turns into a row
 * an administrator can read, and a member cannot read it at all.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { createApp } from '../index.js';
import { createDb, type Db } from '../db/index.js';
import { migrate } from '../db/migrate.js';
import { seedLibrary } from '../library/seedLibrary.js';
import { createUser } from '../services/userService.js';
import type { Resolver } from '../integrations/anthropic.js';
import type { AuditEvent } from '../services/auditService.js';

const resolver: Resolver = async () => {
  throw new Error('not used');
};

let base: string;
let admin: string;
let member: string;
let db: Db;

async function signIn(username: string, password: string): Promise<string> {
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  return res.headers.get('set-cookie')!.split(';')[0]!;
}

async function events(cookie: string, query = ''): Promise<{ status: number; events: AuditEvent[] }> {
  const res = await fetch(`${base}/api/audit${query}`, { headers: { cookie } });
  if (!res.ok) return { status: res.status, events: [] };
  const body = (await res.json()) as { events: AuditEvent[] };
  return { status: res.status, events: body.events };
}

beforeAll(async () => {
  db = await createDb({ driver: 'sqlite', sqliteFile: ':memory:' });
  await migrate(db);
  await seedLibrary(db);
  await createUser(db, { username: 'dale', password: 'a-good-long-password', role: 'admin' });
  await createUser(db, { username: 'sam', password: 'another-long-password', role: 'member' });
  const app = await createApp(db, resolver);
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  admin = await signIn('dale', 'a-good-long-password');
  member = await signIn('sam', 'another-long-password');
  // A refusal, which is the event an administrator most wants to find.
  await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'dale', password: 'wrong-password-entirely' }),
  });
  // Writes are not awaited by the routes that make them, by design.
  await new Promise((resolve) => setTimeout(resolve, 150));
});

describe('what the audit log records', () => {
  it('records a sign-in, with who and from where', async () => {
    const { events: rows } = await events(admin, '?action=session.signedIn');
    expect(rows.length).toBeGreaterThanOrEqual(2);
    const mine = rows.find((row) => row.username === 'dale')!;
    expect(mine.summary).toContain('signed in');
    expect(mine.ip).not.toBeNull();
  });

  it('records a refused sign-in with the reason, and never the password', async () => {
    const { events: rows } = await events(admin, '?action=session.refused');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.username).toBe('dale');
    // "unknown" covers a wrong username and a wrong password alike - the app
    // gives the same answer either way, and the log does not know more than
    // the person at the screen was told.
    expect(rows[0]!.detail.reason).toBe('unknown');
    expect(JSON.stringify(rows[0])).not.toContain('wrong-password-entirely');
  });

  it('records a download with what was in it', async () => {
    const res = await fetch(`${base}/api/sheets/package`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: admin },
      body: JSON.stringify({
        name: 'Audit Test Sheet',
        itemType: 'Product',
        fields: [{ name: 'akamaiImageCount' }],
        rows: [['17331268', '3']],
      }),
    });
    expect(res.status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 150));

    const { events: rows } = await events(admin, '?action=sheet.downloaded');
    expect(rows).toHaveLength(1);
    const event = rows[0]!;
    expect(event.summary).toContain('downloaded');
    expect(event.detail.itemType).toBe('Product');
    expect(event.detail.fields).toEqual(['akamaiImageCount']);
    expect(event.detail.rows).toBe(1);
  });

  it('filters by who did it', async () => {
    const { events: mine } = await events(admin, '?username=sam');
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((row) => row.username === 'sam')).toBe(true);
  });

  it('is newest first', async () => {
    const { events: rows } = await events(admin);
    const times = rows.map((row) => row.at);
    expect([...times].sort().reverse()).toEqual(times);
  });
});

describe('who can read it', () => {
  it('refuses a member, on the server rather than by hiding the tab', async () => {
    const { status } = await events(member);
    expect(status).toBe(403);
  });

  it('refuses somebody with no session at all', async () => {
    const res = await fetch(`${base}/api/audit`);
    expect(res.status).toBe(401);
  });
});

describe('recording never breaks the thing it records', () => {
  it('lets the action succeed even when the audit write fails', async () => {
    // The one place an error is deliberately swallowed: a row is worth having,
    // and it is not worth a user losing a download over.
    const { record } = await import('../services/auditService.js');
    const broken = { ...db, run: async () => { throw new Error('database gone'); } } as unknown as Db;
    await expect(
      record(broken, { username: 'dale', action: 'session.signedIn', summary: 'x' }),
    ).resolves.toBeUndefined();
  });
});
