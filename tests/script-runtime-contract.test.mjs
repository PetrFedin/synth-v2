import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// `pg` is CommonJS and publishes no `exports` map, so `import { Pool } from 'pg'` throws
// "Named export 'Pool' not found" the moment the script is loaded. The test suite cannot catch this
// on its own: tests resolve `pg` through tests/pg-test-facade.mjs, which re-exports the named
// bindings. Operational entry points get no such facade, so the contract is asserted directly.
test('operational scripts import pg through its default export', async () => {
  const dir = path.join(root, 'scripts');
  const offenders = [];
  for (const entry of await readdir(dir)) {
    if (!entry.endsWith('.mjs')) continue;
    const source = await readFile(path.join(dir, entry), 'utf8');
    if (/import\s*\{[^}]*\}\s*from\s*['"]pg['"]/.test(source)) offenders.push(`scripts/${entry}`);
  }
  assert.deepEqual(offenders, [], `named pg imports fail at load time: ${offenders.join(', ')}`);
});

test('acceptance and bootstrap entry points resolve their module graph', async () => {
  const entryPoints = [
    'scripts/acceptance-collection.mjs',
    'scripts/acceptance-product-readiness.mjs',
    'scripts/acceptance-product-commercialization.mjs',
    'scripts/bootstrap-production-reference.mjs',
    'scripts/bootstrap-owner.mjs',
    'scripts/bootstrap-mdm-reference.mjs',
    'scripts/migrate.mjs',
    'scripts/requeue-outbox-event.mjs',
  ];
  for (const entry of entryPoints) {
    const source = await readFile(path.join(root, entry), 'utf8');
    assert.match(source, /import pg from 'pg';|from '\.\.\/src\//, entry);
    assert.doesNotMatch(source, /import\s*\{[^}]*\}\s*from\s*['"]pg['"]/, entry);
  }
});
