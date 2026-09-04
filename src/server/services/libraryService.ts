/**
 * The library store.
 *
 * Templates are read whole and the catalogue is derived from them on the way
 * out, so adding or editing a template in-app changes what the field picker
 * offers and what the resolver will accept with no redeploy (§6.3). The derived
 * catalogue is cached against a revision counter that every write bumps -
 * nothing else needs to know when to invalidate it.
 */

import type { Db } from '../db/index.js';
import type { LibraryTemplate } from '../../shared/library.js';
import { buildCatalogue, type Catalogue } from '../domain/catalogue.js';

interface Row {
  document: string;
}

/** Cached per connection, so tests running several databases in one process do not share one. */
const cache = new WeakMap<Db, { templates: LibraryTemplate[]; catalogue: Catalogue }>();

function invalidate(db: Db): void {
  cache.delete(db);
}

function itemTypesOf(template: LibraryTemplate): string {
  return [...new Set(template.blocks.map((b) => b.itemType))].join(',');
}

export async function listTemplates(db: Db): Promise<LibraryTemplate[]> {
  const rows = await db.all<Row>('SELECT document FROM library_template ORDER BY source_path');
  return rows.map((row) => JSON.parse(row.document) as LibraryTemplate);
}

export async function getTemplate(db: Db, id: string): Promise<LibraryTemplate | undefined> {
  const row = await db.get<Row>('SELECT document FROM library_template WHERE id = ?', [id]);
  return row ? (JSON.parse(row.document) as LibraryTemplate) : undefined;
}

export async function saveTemplate(db: Db, template: LibraryTemplate): Promise<void> {
  const exists = await db.get<{ id: string }>('SELECT id FROM library_template WHERE id = ?', [template.id]);
  const params = [
    template.name,
    template.sourcePath,
    template.group,
    template.direction,
    template.dataSource,
    itemTypesOf(template),
    template.origin,
    template.verified ? 1 : 0,
    template.notes ?? null,
    JSON.stringify(template),
    template.updatedAt,
  ];
  if (exists) {
    await db.run(
      `UPDATE library_template SET name = ?, source_path = ?, folder = ?, direction = ?, data_source = ?,
              item_types = ?, origin = ?, verified = ?, notes = ?, document = ?, updated_at = ?
       WHERE id = ?`,
      [...params, template.id],
    );
  } else {
    await db.run(
      `INSERT INTO library_template
         (name, source_path, folder, direction, data_source, item_types, origin, verified, notes, document, updated_at, id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [...params, template.id, template.createdAt],
    );
  }
  invalidate(db);
}

export async function deleteTemplate(db: Db, id: string): Promise<void> {
  await db.run('DELETE FROM library_template WHERE id = ?', [id]);
  invalidate(db);
}

export async function countTemplates(db: Db): Promise<number> {
  const row = await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM library_template');
  return Number(row?.n ?? 0);
}

export interface Library {
  templates: LibraryTemplate[];
  catalogue: Catalogue;
}

/** Templates and the catalogue derived from them, cached until something writes. */
export async function loadLibrary(db: Db): Promise<Library> {
  const cached = cache.get(db);
  if (cached) return cached;
  const templates = await listTemplates(db);
  const catalogue = buildCatalogue(templates);
  const library = { templates, catalogue };
  cache.set(db, library);
  return library;
}
