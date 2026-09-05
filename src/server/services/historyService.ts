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

export type Outcome = 'downloaded' | 'learned';

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
    outcome: row.outcome === 'learned' ? 'learned' : 'downloaded',
    request: JSON.parse(row.request) as SheetRequest,
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
