/**
 * Loading the supplied extraction into the library store.
 *
 * `loadsheet-extraction-raw.json` is read as data at seed time - the 109
 * records are never retyped, and the file stays in the repository as the
 * provenance of everything the app claims to know.
 *
 * Seeding is additive and idempotent: a record already in the store is left
 * alone, because it may have been edited in-app since. `force` reinstates the
 * shipped version, which is the way back from a bad edit.
 */

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Db } from '../db/index.js';
import { getTemplate, saveTemplate } from '../services/libraryService.js';
import { normaliseSeed, type RawTemplate } from './seedTemplates.js';

const SEED_FILE = new URL('./loadsheet-extraction-raw.json', import.meta.url);

export function readSeedFile(): RawTemplate[] {
  return JSON.parse(fs.readFileSync(fileURLToPath(SEED_FILE), 'utf8')) as RawTemplate[];
}

export interface SeedResult {
  added: number;
  replaced: number;
  skipped: number;
}

export async function seedLibrary(db: Db, options: { force?: boolean } = {}): Promise<SeedResult> {
  const templates = normaliseSeed(readSeedFile());
  const result: SeedResult = { added: 0, replaced: 0, skipped: 0 };

  for (const template of templates) {
    const existing = await getTemplate(db, template.id);
    if (existing && !options.force) {
      result.skipped++;
      continue;
    }
    await saveTemplate(db, existing ? { ...template, createdAt: existing.createdAt } : template);
    if (existing) result.replaced++;
    else result.added++;
  }
  return result;
}
