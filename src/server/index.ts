import cookieParser from 'cookie-parser';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from './config/env.js';
import { getDb, type Db } from './db/index.js';
import { migrate } from './db/migrate.js';
import { seedLibrary } from './library/seedLibrary.js';
import { attachUser, requireUser } from './auth/middleware.js';
import { countTemplates } from './services/libraryService.js';
import { bootstrapAdmin, countUsers, purgeExpiredSessions } from './services/userService.js';
import { authRoutes } from './routes/auth.js';
import { libraryRoutes } from './routes/library.js';
import { sheetRoutes } from './routes/sheets.js';
import { userRoutes } from './routes/users.js';
import type { Resolver } from './integrations/anthropic.js';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * `db` and `resolver` are injectable so tests can drive the real routes against
 * an in-memory database, and without calling the model.
 */
export async function createApp(injected?: Db, resolver?: Resolver): Promise<express.Express> {
  const db = injected ?? (await getDb());
  await migrate(db);
  await purgeExpiredSessions(db);

  // An empty library makes the app useless, so a fresh installation seeds
  // itself from the supplied extraction on first boot. It is additive, so a
  // library that has been edited since is left alone.
  if ((await countTemplates(db)) === 0) {
    const result = await seedLibrary(db);
    console.log(`seeded the load sheet library: ${result.added} templates`);
  }

  const bootstrapped = await bootstrapAdmin(db, env.bootstrapAdmin);
  if (bootstrapped) console.log(bootstrapped);
  if ((await countUsers(db)) === 0) {
    console.warn(
      'there are no accounts, so nobody can sign in. Set BOOTSTRAP_ADMIN_USERNAME and BOOTSTRAP_ADMIN_PASSWORD and restart.',
    );
  }

  const app = express();
  // Render terminates TLS in front of the service; without this, req.ip is the
  // proxy for every request and the login rate limit would count everyone as
  // one person.
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '25mb' }));
  app.use(cookieParser());

  app.get('/healthz', (_req, res) => res.json({ ok: true }));

  app.use(attachUser(db));
  app.use('/api/auth', authRoutes(db));

  // Everything else behind /api needs a session. Applied to the whole surface
  // rather than route by route, so a route added later is protected by default.
  app.use('/api', requireUser);
  app.use('/api/library', libraryRoutes(db));
  app.use('/api/sheets', sheetRoutes(db, resolver));
  app.use('/api/users', userRoutes(db));

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
