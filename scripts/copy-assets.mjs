// The seed extraction is data the compiled server reads at runtime, so it has
// to travel to dist/ alongside the code that reads it.
import fs from 'node:fs';
import path from 'node:path';

const files = ['src/server/library/loadsheet-extraction-raw.json', 'src/server/db/schema.sql'];
for (const file of files) {
  const target = file.replace(/^src\//, 'dist/');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(file, target);
  console.log(`copied ${file} -> ${target}`);
}

const migrations = 'src/server/db/migrations';
if (fs.existsSync(migrations)) {
  const target = migrations.replace(/^src\//, 'dist/');
  fs.mkdirSync(target, { recursive: true });
  for (const name of fs.readdirSync(migrations)) fs.copyFileSync(path.join(migrations, name), path.join(target, name));
}
