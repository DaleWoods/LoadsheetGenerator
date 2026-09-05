/**
 * Accounts and sessions.
 *
 * Individual logins, not a shared link (§4). The first administrator comes from
 * the environment, because a fresh database has nobody in it and sign-in needs
 * somebody; everyone else is added in the app by an administrator.
 */

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Db } from '../db/index.js';
import { hashPassword, passwordProblem, verifyPassword } from '../auth/passwords.js';

export type Role = 'admin' | 'member';

export interface User {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  disabled: boolean;
  mustChange: boolean;
  createdAt: string;
  lastSeenAt: string | null;
}

interface UserRow {
  id: string;
  username: string;
  display_name: string;
  password_hash: string;
  role: string;
  disabled: number;
  must_change: number;
  created_at: string;
  last_seen_at: string | null;
}

function toUser(row: UserRow): User {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role === 'admin' ? 'admin' : 'member',
    disabled: Number(row.disabled) === 1,
    mustChange: Number(row.must_change) === 1,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
  };
}

export function normaliseUsername(username: string): string {
  return username.trim().toLowerCase();
}

export async function findByUsername(db: Db, username: string): Promise<User | undefined> {
  const row = await db.get<UserRow>('SELECT * FROM app_user WHERE username = ?', [normaliseUsername(username)]);
  return row ? toUser(row) : undefined;
}

export async function findById(db: Db, id: string): Promise<User | undefined> {
  const row = await db.get<UserRow>('SELECT * FROM app_user WHERE id = ?', [id]);
  return row ? toUser(row) : undefined;
}

export async function listUsers(db: Db): Promise<User[]> {
  const rows = await db.all<UserRow>('SELECT * FROM app_user ORDER BY username');
  return rows.map(toUser);
}

export async function countUsers(db: Db): Promise<number> {
  const row = await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM app_user');
  return Number(row?.n ?? 0);
}

export interface NewUser {
  username: string;
  displayName?: string;
  password: string;
  role?: Role;
  mustChange?: boolean;
}

export async function createUser(db: Db, input: NewUser): Promise<User> {
  const username = normaliseUsername(input.username);
  if (!/^[a-z0-9][a-z0-9._-]{1,60}$/.test(username)) {
    throw new Error('A username is letters, numbers, dots, dashes or underscores.');
  }
  const problem = passwordProblem(input.password);
  if (problem) throw new Error(problem);
  if (await findByUsername(db, username)) throw new Error(`There is already an account called ${username}.`);

  const now = new Date().toISOString();
  const user: UserRow = {
    id: randomUUID(),
    username,
    display_name: input.displayName?.trim() || username,
    password_hash: await hashPassword(input.password),
    role: input.role ?? 'member',
    disabled: 0,
    must_change: input.mustChange ? 1 : 0,
    created_at: now,
    last_seen_at: null,
  };
  await db.run(
    `INSERT INTO app_user (id, username, display_name, password_hash, role, disabled, must_change, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [user.id, user.username, user.display_name, user.password_hash, user.role, user.disabled, user.must_change, user.created_at],
  );
  return toUser(user);
}

export async function setPassword(db: Db, id: string, password: string, mustChange = false): Promise<void> {
  const problem = passwordProblem(password);
  if (problem) throw new Error(problem);
  await db.run('UPDATE app_user SET password_hash = ?, must_change = ? WHERE id = ?', [
    await hashPassword(password),
    mustChange ? 1 : 0,
    id,
  ]);
  // A password change ends every session but the one making it; the caller
  // issues a fresh cookie. Anything else leaves an old session usable after a
  // reset, which is the whole reason for resetting.
  await db.run('DELETE FROM user_session WHERE user_id = ?', [id]);
}

export async function setDisabled(db: Db, id: string, disabled: boolean): Promise<void> {
  await db.run('UPDATE app_user SET disabled = ? WHERE id = ?', [disabled ? 1 : 0, id]);
  if (disabled) await db.run('DELETE FROM user_session WHERE user_id = ?', [id]);
}

export async function setRole(db: Db, id: string, role: Role): Promise<void> {
  await db.run('UPDATE app_user SET role = ? WHERE id = ?', [role, id]);
}

export async function countAdmins(db: Db): Promise<number> {
  const row = await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM app_user WHERE role = 'admin' AND disabled = 0");
  return Number(row?.n ?? 0);
}

/* -------------------------------------------------------------------------- */
/* Sessions                                                                    */
/* -------------------------------------------------------------------------- */

export const SESSION_COOKIE = 'loadsheet_session';
const SESSION_DAYS = 14;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function startSession(db: Db, userId: string, userAgent?: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('base64url');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.run(
    'INSERT INTO user_session (token_hash, user_id, created_at, expires_at, user_agent) VALUES (?, ?, ?, ?, ?)',
    [hashToken(token), userId, now.toISOString(), expiresAt.toISOString(), userAgent?.slice(0, 300) ?? null],
  );
  return { token, expiresAt };
}

export async function userForSession(db: Db, token: string): Promise<User | undefined> {
  const row = await db.get<{ user_id: string; expires_at: string }>(
    'SELECT user_id, expires_at FROM user_session WHERE token_hash = ?',
    [hashToken(token)],
  );
  if (!row) return undefined;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await db.run('DELETE FROM user_session WHERE token_hash = ?', [hashToken(token)]);
    return undefined;
  }
  const user = await findById(db, row.user_id);
  if (!user || user.disabled) return undefined;
  return user;
}

export async function endSession(db: Db, token: string): Promise<void> {
  await db.run('DELETE FROM user_session WHERE token_hash = ?', [hashToken(token)]);
}

export async function touch(db: Db, id: string): Promise<void> {
  await db.run('UPDATE app_user SET last_seen_at = ? WHERE id = ?', [new Date().toISOString(), id]);
}

/** Sessions outlive nothing useful once expired; cleared on boot. */
export async function purgeExpiredSessions(db: Db): Promise<void> {
  await db.run('DELETE FROM user_session WHERE expires_at < ?', [new Date().toISOString()]);
}

/* -------------------------------------------------------------------------- */
/* Signing in                                                                  */
/* -------------------------------------------------------------------------- */

export type SignInResult =
  | { ok: true; user: User }
  | { ok: false; reason: 'unknown' | 'disabled' | 'throttled'; retryInSeconds?: number };

// Deliberately in memory: this is a rate limit, not a record. It resets when the
// service restarts, which is acceptable for slowing down guessing at a login
// only a handful of people use.
const attempts = new Map<string, { count: number; until: number }>();
const MAX_ATTEMPTS = 8;
const MAX_ATTEMPTS_PER_USER = 20;
const LOCKOUT_MS = 5 * 60 * 1000;

export function attemptKey(username: string, ip: string | undefined): string {
  return `${normaliseUsername(username)}|${ip ?? 'unknown'}`;
}

/**
 * Failures are counted twice: once per username and address, and once per
 * username alone. The address is taken from `X-Forwarded-For` behind Render's
 * proxy, and anyone guessing at a password can vary that header - so counting
 * only per address would let them start again with every request. The
 * username-only count is the one that actually slows down guessing at a known
 * account; it is more generous, so a whole office sharing an address does not
 * lock each other out by fumbling their own passwords.
 */
function throttled(keys: string[]): { retryInSeconds: number } | null {
  for (const key of keys) {
    const record = attempts.get(key);
    const limit = key.endsWith('|*') ? MAX_ATTEMPTS_PER_USER : MAX_ATTEMPTS;
    if (record && record.count >= limit && record.until > Date.now()) {
      return { retryInSeconds: Math.ceil((record.until - Date.now()) / 1000) };
    }
  }
  return null;
}

export async function signIn(db: Db, username: string, password: string, ip?: string): Promise<SignInResult> {
  const keys = [attemptKey(username, ip), `${normaliseUsername(username)}|*`];
  const blocked = throttled(keys);
  if (blocked) return { ok: false, reason: 'throttled', retryInSeconds: blocked.retryInSeconds };

  const user = await findByUsername(db, username);
  // The hash is verified even when there is no such account, so a wrong
  // username and a wrong password take the same time to answer.
  const stored =
    (await db.get<{ password_hash: string }>('SELECT password_hash FROM app_user WHERE username = ?', [
      normaliseUsername(username),
    ]))?.password_hash ?? 'scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAA';
  const correct = await verifyPassword(password, stored);

  if (!user || !correct) {
    for (const key of keys) {
      attempts.set(key, { count: (attempts.get(key)?.count ?? 0) + 1, until: Date.now() + LOCKOUT_MS });
    }
    return { ok: false, reason: 'unknown' };
  }
  if (user.disabled) return { ok: false, reason: 'disabled' };

  for (const key of keys) attempts.delete(key);
  await touch(db, user.id);
  return { ok: true, user };
}

/** For tests, which sign in wrongly on purpose. */
export function resetThrottle(): void {
  attempts.clear();
}

/* -------------------------------------------------------------------------- */
/* The first way in                                                            */
/* -------------------------------------------------------------------------- */

export interface BootstrapOptions {
  username?: string;
  password?: string;
  displayName?: string;
}

/**
 * Creates the first administrator from the environment, and resets that
 * account's password if it is set again later - which is the way back in when
 * the only administrator is locked out.
 *
 * A database with no accounts cannot be signed in to at all, so this is the
 * only route in on a fresh deployment.
 */
export async function bootstrapAdmin(db: Db, options: BootstrapOptions): Promise<string | null> {
  const username = options.username?.trim();
  const password = options.password;
  if (!username || !password) return null;

  const problem = passwordProblem(password);
  if (problem) throw new Error(`BOOTSTRAP_ADMIN_PASSWORD: ${problem}`);

  const existing = await findByUsername(db, username);
  if (!existing) {
    const user = await createUser(db, {
      username,
      password,
      displayName: options.displayName ?? username,
      role: 'admin',
    });
    return `created the administrator account ${user.username}`;
  }

  await setPassword(db, existing.id, password);
  if (existing.role !== 'admin' || existing.disabled) {
    await setRole(db, existing.id, 'admin');
    await setDisabled(db, existing.id, false);
  }
  return `reset the password for ${existing.username}`;
}
