/**
 * A record of what has been generated (§6.7).
 *
 * What is kept is the request, not the files: replaying it regenerates against
 * today's library, so a sheet reused next month picks up an attribute learned
 * since and the conventions as they stand now. Keeping the output instead would
 * turn history into a drawer of stale files, which is what this app replaces.
 */

import { randomUUID } from 'node:crypto';
import type { Db } from '../db/index.js';
import type { SheetRequest } from './sheetService.js';

/**
 * What became of a sheet. `failed` is reported by hand after HAC rejects one,
 * and is the only outcome that travels backwards: it warns whoever builds the
 * same thing next.
 */
export type Outcome = 'downloaded' | 'learned' | 'failed';

export interface HistoryEntry {
  id: string;
  createdAt: string;
  username: string;
  name: string;
  itemType: string;
  direction: string;
  summary: string;
  filename: string;
  rowCount: number;
  outcome: Outcome;
  request: SheetRequest;
  /** What HAC said, when somebody reported this one as failing. */
  failureNote?: string;
  reportedAt?: string;
}

interface Row {
  id: string;
  created_at: string;
  username: string;
  name: string;
  item_type: string;
  direction: string;
  request: string;
  summary: string;
  filename: string;
  row_count: number;
  outcome: string;
  failure_note: string | null;
  reported_at: string | null;
}

function toEntry(row: Row): HistoryEntry {
  return {
    id: row.id,
    createdAt: row.created_at,
    username: row.username,
    name: row.name,
    itemType: row.item_type,
    direction: row.direction,
    summary: row.summary,
    filename: row.filename,
    rowCount: Number(row.row_count),
    outcome: row.outcome === 'learned' ? 'learned' : row.outcome === 'failed' ? 'failed' : 'downloaded',
    request: JSON.parse(row.request) as SheetRequest,
    ...(row.failure_note ? { failureNote: row.failure_note } : {}),
    ...(row.reported_at ? { reportedAt: row.reported_at } : {}),
  };
}

export interface RecordInput {
  request: SheetRequest;
  summary: string;
  filename: string;
  direction: string;
  rowCount: number;
  outcome: Outcome;
  user: { id: string; username: string };
}

export async function record(db: Db, input: RecordInput): Promise<void> {
  // The confirmation tick is a decision about one download, not part of what
  // was asked for, so it is not carried into the reused request.
  const { confirmedUnverified: _ignored, ...request } = input.request;
  await db.run(
    `INSERT INTO generation
       (id, created_at, user_id, username, name, item_type, direction, request, summary, filename, row_count, outcome)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      randomUUID(),
      new Date().toISOString(),
      input.user.id,
      input.user.username,
      request.name,
      request.itemType,
      input.direction,
      JSON.stringify(request),
      input.summary,
      input.filename,
      input.rowCount,
      input.outcome,
    ],
  );
}

export async function listHistory(db: Db, options: { limit?: number; username?: string } = {}): Promise<HistoryEntry[]> {
  const limit = Math.min(options.limit ?? 50, 200);
  const rows = options.username
    ? await db.all<Row>('SELECT * FROM generation WHERE username = ? ORDER BY created_at DESC LIMIT ?', [
        options.username,
        limit,
      ])
    : await db.all<Row>('SELECT * FROM generation ORDER BY created_at DESC LIMIT ?', [limit]);
  return rows.map(toEntry);
}

export async function getEntry(db: Db, id: string): Promise<HistoryEntry | undefined> {
  const row = await db.get<Row>('SELECT * FROM generation WHERE id = ?', [id]);
  return row ? toEntry(row) : undefined;
}

/**
 * Reporting that a sheet failed after it left the app.
 *
 * The message is kept whole, in the words HAC used. Parsing it would mean
 * guessing at a format that varies by error, and the part worth keeping is
 * usually the part a guess would drop.
 */
export async function reportFailure(db: Db, id: string, note: string): Promise<HistoryEntry | undefined> {
  const entry = await getEntry(db, id);
  if (!entry) return undefined;
  await db.run('UPDATE generation SET outcome = ?, failure_note = ?, reported_at = ? WHERE id = ?', [
    'failed',
    note,
    new Date().toISOString(),
    id,
  ]);
  return getEntry(db, id);
}

/**
 * Sheets reported as failing that wrote the same fields onto the same item
 * type as the one being built now.
 *
 * Matched on the exact set of attributes rather than an overlap, deliberately.
 * A sheet sharing one field with a failure is not the failure, and a warning
 * that fires on every sheet touching `code` is one nobody reads by the second
 * week. This fires when you are rebuilding the thing that broke.
 */
export async function failuresLike(
  db: Db,
  itemType: string,
  attributes: string[],
): Promise<{ at: string; note: string; name: string }[]> {
  const wanted = [...new Set(attributes.map((a) => a.toLowerCase()))].sort().join(',');
  if (wanted === '') return [];
  const rows = await db.all<Row>(
    "SELECT * FROM generation WHERE outcome = 'failed' AND LOWER(item_type) = ? ORDER BY created_at DESC LIMIT 200",
    [itemType.toLowerCase()],
  );
  return rows
    .filter((row) => {
      const request = JSON.parse(row.request) as SheetRequest;
      const theirs = [...new Set(request.fields.map((field) => field.name.toLowerCase()))].sort().join(',');
      return theirs === wanted;
    })
    .map((row) => ({ at: row.reported_at ?? row.created_at, note: row.failure_note ?? '', name: row.name }));
}
