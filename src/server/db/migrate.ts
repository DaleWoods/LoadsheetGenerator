import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { closeDb, getDb, type Db } from './index.js';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Baseline first, then every migration once, in name order. */
export async function migrate(db: Db): Promise<void> {
  await db.exec(fs.readFileSync(path.join(here, 'schema.sql'), 'utf8'));

  const dir = path.join(here, 'migrations');
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort() : [];
  const applied = new Set((await db.all<{ id: string }>('SELECT id FROM schema_migration')).map((r) => r.id));

  for (const file of files) {
    if (applied.has(file)) continue;
    await db.exec(fs.readFileSync(path.join(dir, file), 'utf8'));
    await db.run('INSERT INTO schema_migration (id, applied_at) VALUES (?, ?)', [file, new Date().toISOString()]);
    console.log(`applied ${file}`);
  }
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const db = await getDb();
  await migrate(db);
  await closeDb();
  console.log('schema up to date');
}
