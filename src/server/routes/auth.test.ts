import { beforeEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { createApp } from '../index.js';
import { createDb, type Db } from '../db/index.js';
import { migrate } from '../db/migrate.js';
import {
  bootstrapAdmin,
  createUser,
  listUsers,
  resetThrottle,
  signIn as signInDirect,
} from '../services/userService.js';

interface Harness {
  base: string;
  close: () => Promise<void>;
  db: Db;
}

async function serve(): Promise<Harness> {
  const db = await createDb({ driver: 'sqlite', sqliteFile: ':memory:' });
  await migrate(db);
  const app = await createApp(db);
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  return {
    db,
    base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

function post(base: string, path: string, body: unknown, cookie?: string): Promise<Response> {
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

async function signIn(base: string, username: string, password: string): Promise<string> {
  const response = await post(base, '/api/auth/login', { username, password });
  return (response.headers.get('set-cookie') ?? '').split(';')[0]!;
}

describe('signing in', () => {
  let app: Harness;
  beforeEach(async () => {
    resetThrottle();
    app = await serve();
    await createUser(app.db, { username: 'dale', password: 'a-good-long-password', role: 'admin' });
  });

  it('keeps everything behind a sign-in', async () => {
    // The service is on the internet once deployed; it is not a public link (§4).
    expect((await fetch(`${app.base}/api/library/item-types`)).status).toBe(401);
    expect((await post(app.base, '/api/sheets/preview', { name: 'x', itemType: 'Product', fields: [{ name: 'name' }] })).status).toBe(401);
    // The health check stays open, because Render calls it without a cookie.
    expect((await fetch(`${app.base}/healthz`)).status).toBe(200);
  });

  it('lets a known account in and remembers it', async () => {
    const cookie = await signIn(app.base, 'dale', 'a-good-long-password');
    expect(cookie).toContain('loadsheet_session=');
    const me = (await (await fetch(`${app.base}/api/auth/me`, { headers: { cookie } })).json()) as {
      user: { username: string; role: string };
    };
    expect(me.user).toMatchObject({ username: 'dale', role: 'admin' });
    expect((await fetch(`${app.base}/api/library/item-types`, { headers: { cookie } })).status).toBe(200);
  });

  it('is case-insensitive about the username but not the password', async () => {
    expect((await post(app.base, '/api/auth/login', { username: 'DALE', password: 'a-good-long-password' })).status).toBe(200);
    expect((await post(app.base, '/api/auth/login', { username: 'dale', password: 'A-Good-Long-Password' })).status).toBe(401);
  });

  it('says the same thing whether the username or the password was wrong', async () => {
    const wrongUser = await post(app.base, '/api/auth/login', { username: 'nobody', password: 'a-good-long-password' });
    const wrongPassword = await post(app.base, '/api/auth/login', { username: 'dale', password: 'not-the-password' });
    expect(wrongUser.status).toBe(401);
    expect(wrongPassword.status).toBe(401);
    expect(await wrongUser.json()).toEqual(await wrongPassword.json());
  });

  it('slows down guessing', async () => {
    for (let attempt = 0; attempt < 8; attempt++) {
      await post(app.base, '/api/auth/login', { username: 'dale', password: `guess-${attempt}` });
    }
    const throttled = await post(app.base, '/api/auth/login', { username: 'dale', password: 'a-good-long-password' });
    expect(throttled.status).toBe(429);
  });

  it('keeps counting when the address changes, because a header can be forged', async () => {
    // Behind Render's proxy the address comes from X-Forwarded-For, which
    // anyone guessing at a password can vary from request to request. Counting
    // only per address would reset the limit every time they did.
    for (let attempt = 0; attempt < 20; attempt++) {
      const result = await signInDirect(app.db, 'dale', `guess-${attempt}`, `10.0.0.${attempt}`);
      expect(result.ok).toBe(false);
    }
    const fromSomewhereNew = await signInDirect(app.db, 'dale', 'a-good-long-password', '10.0.9.9');
    expect(fromSomewhereNew).toMatchObject({ ok: false, reason: 'throttled' });
  });

  it('ends the session on the way out', async () => {
    const cookie = await signIn(app.base, 'dale', 'a-good-long-password');
    await post(app.base, '/api/auth/logout', {}, cookie);
    expect((await fetch(`${app.base}/api/library/item-types`, { headers: { cookie } })).status).toBe(401);
  });

  it('refuses a session for an account that has been switched off', async () => {
    const cookie = await signIn(app.base, 'dale', 'a-good-long-password');
    await createUser(app.db, { username: 'sam', password: 'another-long-password' });
    const sam = (await listUsers(app.db)).find((user) => user.username === 'sam')!;
    const samCookie = await signIn(app.base, 'sam', 'another-long-password');

    await fetch(`${app.base}/api/users/${sam.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({ disabled: true }),
    });
    expect((await fetch(`${app.base}/api/library/item-types`, { headers: { cookie: samCookie } })).status).toBe(401);
    expect((await post(app.base, '/api/auth/login', { username: 'sam', password: 'another-long-password' })).status).toBe(403);
  });
});

describe('accounts', () => {
  let app: Harness;
  let admin: string;
  beforeEach(async () => {
    resetThrottle();
    app = await serve();
    await createUser(app.db, { username: 'dale', password: 'a-good-long-password', role: 'admin' });
    admin = await signIn(app.base, 'dale', 'a-good-long-password');
  });

  it('is only administrators who can manage them', async () => {
    await createUser(app.db, { username: 'sam', password: 'another-long-password' });
    const sam = await signIn(app.base, 'sam', 'another-long-password');
    expect((await fetch(`${app.base}/api/users`, { headers: { cookie: sam } })).status).toBe(403);
    expect((await fetch(`${app.base}/api/users`, { headers: { cookie: admin } })).status).toBe(200);
  });

  it('makes a new account change the password it was given', async () => {
    const created = await post(
      app.base,
      '/api/users',
      { username: 'jo', password: 'temporary-password', displayName: 'Jo' },
      admin,
    );
    expect(created.status).toBe(201);

    const cookie = await signIn(app.base, 'jo', 'temporary-password');
    // Signed in, but held at the door until the handed-out password is replaced.
    const blocked = await fetch(`${app.base}/api/library/item-types`, { headers: { cookie } });
    expect(blocked.status).toBe(403);
    expect((await blocked.json()) as { mustChange: boolean }).toMatchObject({ mustChange: true });

    const changed = await post(
      app.base,
      '/api/auth/password',
      { currentPassword: 'temporary-password', newPassword: 'a-password-of-my-own' },
      cookie,
    );
    expect(changed.status).toBe(200);
    const fresh = (changed.headers.get('set-cookie') ?? '').split(';')[0]!;
    expect((await fetch(`${app.base}/api/library/item-types`, { headers: { cookie: fresh } })).status).toBe(200);
  });

  it('will not lock the last administrator out', async () => {
    const dale = (await listUsers(app.db)).find((user) => user.username === 'dale')!;
    const refused = await fetch(`${app.base}/api/users/${dale.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', cookie: admin },
      body: JSON.stringify({ disabled: true }),
    });
    expect(refused.status).toBe(409);
    expect((await refused.json()) as { error: string }).toMatchObject({
      error: expect.stringContaining('only administrator'),
    });
  });

  it('refuses a password that is too short to be worth having', async () => {
    const response = await post(app.base, '/api/users', { username: 'jo', password: 'short' }, admin);
    expect(response.status).toBe(400);
    expect((await response.json()) as { error: string }).toMatchObject({ error: expect.stringContaining('10 characters') });
  });

  it('ends a user other sessions when their password is reset', async () => {
    await createUser(app.db, { username: 'sam', password: 'another-long-password' });
    const sam = (await listUsers(app.db)).find((user) => user.username === 'sam')!;
    const samCookie = await signIn(app.base, 'sam', 'another-long-password');
    expect((await fetch(`${app.base}/api/library/item-types`, { headers: { cookie: samCookie } })).status).toBe(200);

    await fetch(`${app.base}/api/users/${sam.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', cookie: admin },
      body: JSON.stringify({ password: 'a-reset-password-here' }),
    });
    expect((await fetch(`${app.base}/api/library/item-types`, { headers: { cookie: samCookie } })).status).toBe(401);
  });
});

describe('the first way in', () => {
  it('creates the administrator from the environment, and resets it when set again', async () => {
    const db = await createDb({ driver: 'sqlite', sqliteFile: ':memory:' });
    await migrate(db);

    expect(await bootstrapAdmin(db, { username: 'dale', password: 'a-good-long-password' })).toContain('created');
    const users = await listUsers(db);
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({ username: 'dale', role: 'admin' });

    // Setting it again is the way back in when the only administrator is locked
    // out - it resets that password rather than failing or making a second one.
    expect(await bootstrapAdmin(db, { username: 'dale', password: 'a-different-password' })).toContain('reset');
    expect(await listUsers(db)).toHaveLength(1);
  });

  it('does nothing at all when it is not configured', async () => {
    const db = await createDb({ driver: 'sqlite', sqliteFile: ':memory:' });
    await migrate(db);
    expect(await bootstrapAdmin(db, {})).toBeNull();
    expect(await listUsers(db)).toHaveLength(0);
  });

  it('refuses a bootstrap password that is too weak, rather than starting with it', async () => {
    const db = await createDb({ driver: 'sqlite', sqliteFile: ':memory:' });
    await migrate(db);
    await expect(bootstrapAdmin(db, { username: 'dale', password: 'admin' })).rejects.toThrow(/10 characters/);
  });
});
