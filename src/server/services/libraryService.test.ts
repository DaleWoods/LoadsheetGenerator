import { beforeEach, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../db/index.js';
import { migrate } from '../db/migrate.js';
import { seedLibrary } from '../library/seedLibrary.js';
import { deleteTemplate, getTemplate, listTemplates, loadLibrary, saveTemplate } from './libraryService.js';

async function freshDb(): Promise<Db> {
  const db = await createDb({ driver: 'sqlite', sqliteFile: ':memory:' });
  await migrate(db);
  return db;
}

describe('the library store', () => {
  let db: Db;
  beforeEach(async () => {
    db = await freshDb();
  });

  it('loads the supplied extraction as part of setup', async () => {
    const result = await seedLibrary(db);
    expect(result.added).toBe(109);
    expect(await listTemplates(db)).toHaveLength(109);

    const stored = await getTemplate(db, 'products-site-settings-append-importscript');
    expect(stored?.blocks[0]!.columns[0]!.name).toBe('code');
    expect(stored?.blocks[0]!.csv?.columnsOffset).toBe(0);
  });

  it('seeds again without disturbing what is already there', async () => {
    await seedLibrary(db);
    const edited = (await getTemplate(db, 'categories-append-importscript'))!;
    await saveTemplate(db, { ...edited, notes: 'checked against production 2026-09', origin: 'user' });

    const second = await seedLibrary(db);
    expect(second).toEqual({ added: 0, replaced: 0, skipped: 109 });
    expect((await getTemplate(db, 'categories-append-importscript'))?.notes).toBe('checked against production 2026-09');

    // force is the way back to the shipped version after a bad edit.
    const forced = await seedLibrary(db, { force: true });
    expect(forced.replaced).toBe(109);
    expect((await getTemplate(db, 'categories-append-importscript'))?.notes).toBeUndefined();
  });

  it('derives the catalogue from whatever is stored, with no redeploy', async () => {
    await seedLibrary(db);
    const before = await loadLibrary(db);
    expect(before.catalogue.find('Product', 'isEditorsPick')).toBeUndefined();

    // Adding a template in-app is how a new attribute enters the library (§6.3).
    const template = (await getTemplate(db, 'products-truefalse-usepngimageformat-importscript'))!;
    const columns = template.blocks[0]!.columns.map((c) =>
      c.name === 'usePngImageFormat' ? { ...c, name: 'isEditorsPick', raw: undefined } : c,
    );
    await saveTemplate(db, {
      ...template,
      id: 'user-editors-pick',
      name: 'Products / Editors Pick',
      sourcePath: 'user/editors-pick',
      origin: 'user',
      verified: false,
      blocks: [{ ...template.blocks[0]!, columns }],
    });

    const after = await loadLibrary(db);
    const entry = after.catalogue.find('Product', 'isEditorsPick');
    expect(entry?.attribute).toBe('isEditorsPick');
    expect(entry?.boolean).toBe('declared');
  });

  it('forgets a template that is removed', async () => {
    await seedLibrary(db);
    const before = (await loadLibrary(db)).catalogue.find('Product', 'usePngImageFormat')!.uses;
    await deleteTemplate(db, 'products-truefalse-usepngimageformat-importscript');
    const library = await loadLibrary(db);
    expect(library.templates).toHaveLength(108);
    expect(library.catalogue.find('Product', 'usePngImageFormat')!.uses).toBe(before - 1);
  });
});
