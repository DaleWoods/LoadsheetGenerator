import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from './config/env.js';
import { getDb, type Db } from './db/index.js';
import { migrate } from './db/migrate.js';
import { seedLibrary } from './library/seedLibrary.js';
import { countTemplates } from './services/libraryService.js';
import { libraryRoutes } from './routes/library.js';
import { sheetRoutes } from './routes/sheets.js';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * `db` is injectable so tests can drive the real routes against an in-memory
 * database rather than a mock of them.
 */
export async function createApp(injected?: Db): Promise<express.Express> {
  const db = injected ?? (await getDb());
  await migrate(db);

  // An empty library makes the app useless, so a fresh installation seeds
  // itself from the supplied extraction on first boot. It is additive, so a
  // library that has been edited since is left alone.
  if ((await countTemplates(db)) === 0) {
    const result = await seedLibrary(db);
    console.log(`seeded the load sheet library: ${result.added} templates`);
  }

  const app = express();
  app.use(express.json({ limit: '25mb' }));

  app.get('/healthz', (_req, res) => res.json({ ok: true }));
  app.use('/api/library', libraryRoutes(db));
  app.use('/api/sheets', sheetRoutes(db));

  const web = path.join(here, '..', '..', 'dist-web');
  if (fs.existsSync(web)) {
    app.use(express.static(web));
    app.get('*', (_req, res) => res.sendFile(path.join(web, 'index.html')));
  }

  return app;
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const app = await createApp();
  app.listen(env.port, () => console.log(`load sheet generator listening on ${env.port}`));
}
