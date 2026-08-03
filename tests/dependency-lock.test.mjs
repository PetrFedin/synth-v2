import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const lockfile = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'));
const workflow = await readFile(new URL('../.github/workflows/verify.yml', import.meta.url), 'utf8');

test('production dependencies are exact and match the lockfile root', () => {
  assert.deepEqual(packageJson.dependencies, { pg: '8.13.1' });
  for (const [name, version] of Object.entries(packageJson.dependencies)) {
    assert.match(version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, `${name} must use an exact version`);
  }
  assert.equal(lockfile.lockfileVersion, 3);
  assert.equal(lockfile.name, packageJson.name);
  assert.equal(lockfile.version, packageJson.version);
  assert.deepEqual(lockfile.packages[''].dependencies, packageJson.dependencies);
  assert.equal(lockfile.packages[''].engines.node, packageJson.engines.node);
});

test('the locked PostgreSQL driver has verified registry metadata', () => {
  const pg = lockfile.packages['node_modules/pg'];
  assert.equal(pg.version, '8.13.1');
  assert.equal(pg.resolved, 'https://registry.npmjs.org/pg/-/pg-8.13.1.tgz');
  assert.match(pg.integrity, /^sha512-[A-Za-z0-9+/]+={0,2}$/);

  for (const [path, entry] of Object.entries(lockfile.packages)) {
    if (!path) continue;
    assert.match(entry.resolved, /^https:\/\/registry\.npmjs\.org\//, `${path} must use the official npm registry`);
    assert.match(entry.integrity, /^sha512-[A-Za-z0-9+/]+={0,2}$/, `${path} must have SHA-512 integrity`);
  }
});

test('CI installs only from the immutable lockfile', () => {
  assert.match(workflow, /cache:\s+npm/);
  assert.match(workflow, /cache-dependency-path:\s+package-lock\.json/);
  assert.match(workflow, /npm ci --ignore-scripts --no-audit --no-fund/);
  assert.doesNotMatch(workflow, /npm install/);
});
