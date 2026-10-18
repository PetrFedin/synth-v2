import { spawnSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Parse the isolated suite without importing it or opening any database.
// npm test covers tests/*.test.mjs, so PostgreSQL-only syntax errors otherwise
// remain invisible until the database job starts.
const root = fileURLToPath(new URL('../tests/postgres/', import.meta.url));
async function collect(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(entry => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? collect(target) : target.endsWith('.mjs') ? [target] : [];
  }));
  return files.flat().sort();
}

const files = await collect(root);
if (!files.length) throw new Error('PostgreSQL verification suite is missing');
let failed = false;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    failed = true;
    console.error(result.error?.message || result.stderr || `Cannot parse ${file}`);
  }
}
if (failed) process.exit(1);
console.log(`PostgreSQL test syntax OK (${files.length} modules; no database connection).`);
