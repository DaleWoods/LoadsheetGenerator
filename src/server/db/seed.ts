import { closeDb, getDb } from './index.js';
import { migrate } from './migrate.js';
import { seedLibrary } from '../library/seedLibrary.js';

const force = process.argv.includes('--force');
const db = await getDb();
await migrate(db);
const result = await seedLibrary(db, { force });
console.log(`library: ${result.added} added, ${result.replaced} replaced, ${result.skipped} already present`);
await closeDb();
