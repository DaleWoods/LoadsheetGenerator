/**
 * The record of who did what (§ Audit tab).
 *
 * Recording must never be able to break the thing it is recording. A failed
 * write is logged and swallowed: an audit row is worth having, and it is not
 * worth a user losing a download over. That is the one place in this codebase
 * where an error is deliberately dropped, and it is why `record` returns
 * nothing anybody waits on.
 *
 * The summary is written here rather than derived on the screen, so an event
 * from six months ago still reads the way it did when it happened - a screen
 * that re-words old events is a screen that quietly rewrites history.
 */

import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import type { Db } from '../db/index.js';

/** Every action the app records. Stable strings: they are in the database. */
export type AuditAction =
  | 'session.signedIn'
  | 'session.refused'
  | 'session.signedOut'
  | 'session.passwordChanged'
  | 'account.created'
  | 'account.updated'
  | 'sheet.described'
  | 'sheet.downloaded'
  | 'sheet.saved'
  | 'repository.removed'
  | 'query.written';

export interface AuditEvent {
  id: string;
  at: string;
  userId: string | null;
  username: string;
  action: AuditAction;
  summary: string;
  detail: Record<string, unknown>;
  ip: string | null;
}

export interface RecordInput {
  userId?: string | null;
  username: string;
  action: AuditAction;
  summary: string;
  detail?: Record<string, unknown>;
  ip?: string | null;
}

/** The caller's address, as far as it can be known behind Render's proxy. */
export function addressOf(req: Request): string | null {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) return forwarded.split(',')[0]!.trim();
  return req.ip ?? null;
}

export async function record(db: Db, input: RecordInput): Promise<void> {
  try {
    await db.run(
      `INSERT INTO audit_event (id, at, user_id, username, action, summary, detail, ip)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        new Date().toISOString(),
        input.userId ?? null,
        input.username,
        input.action,
        input.summary,
        JSON.stringify(input.detail ?? {}),
        input.ip ?? null,
      ],
    );
  } catch (error) {
    // Deliberately swallowed: see the note at the top of this file.
    console.error('audit write failed', input.action, error);
  }
}

export interface AuditQuery {
  action?: string;
  username?: string;
  /** Newest first, this many. */
  limit?: number;
  before?: string;
}

interface Row {
  id: string;
  at: string;
  user_id: string | null;
  username: string;
  action: string;
  summary: string;
  detail: string;
  ip: string | null;
}

export async function listAudit(db: Db, query: AuditQuery = {}): Promise<AuditEvent[]> {
  const where: string[] = [];
  const params: (string | number | null)[] = [];
  if (query.action) {
    where.push('action = ?');
    params.push(query.action);
  }
  if (query.username) {
    where.push('LOWER(username) = ?');
    params.push(query.username.toLowerCase());
  }
  if (query.before) {
    where.push('at < ?');
    params.push(query.before);
  }
  const limit = Math.min(Math.max(query.limit ?? 200, 1), 500);
  const rows = await db.all<Row>(
    `SELECT id, at, user_id, username, action, summary, detail, ip FROM audit_event
     ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY at DESC LIMIT ${limit}`,
    params,
  );
  return rows.map((row) => ({
    id: row.id,
    at: row.at,
    userId: row.user_id,
    username: row.username,
    action: row.action as AuditAction,
    summary: row.summary,
    // A row written before a field existed still has to render.
    detail: parseDetail(row.detail),
    ip: row.ip,
  }));
}

function parseDetail(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed !== null && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** The actions and usernames actually present, for the filters. */
export async function auditFacets(db: Db): Promise<{ actions: string[]; usernames: string[] }> {
  const actions = await db.all<{ action: string }>('SELECT DISTINCT action FROM audit_event ORDER BY action', []);
  const usernames = await db.all<{ username: string }>(
    'SELECT DISTINCT username FROM audit_event ORDER BY username',
    [],
  );
  return { actions: actions.map((a) => a.action), usernames: usernames.map((u) => u.username) };
}
