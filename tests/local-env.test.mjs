import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { loadOptionalEnvFile } from '../src/runtime/local-env.mjs';

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('optional local env loader skips a missing file', () => {
  let loadCalls = 0;
  const loaded = loadOptionalEnvFile('.env', {
    existsSyncImpl: () => false,
    loadEnvFileImpl: () => { loadCalls += 1; },
  });
  assert.equal(loaded, false);
  assert.equal(loadCalls, 0);
});

test('optional local env loader loads an existing file exactly once', () => {
  const loadedPaths = [];
  const loaded = loadOptionalEnvFile('.env', {
    existsSyncImpl: () => true,
    loadEnvFileImpl: (filePath) => loadedPaths.push(filePath),
  });
  assert.equal(loaded, true);
  assert.deepEqual(loadedPaths, ['.env']);
});

test('platform-provided environment wins over values from a local env file', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'syntha-env-'));
  const envPath = path.join(directory, '.env');
  const key = `SYNTHA_ENV_PRECEDENCE_${process.pid}`;
  const previous = process.env[key];
  process.env[key] = 'platform';
  try {
    await writeFile(envPath, `${key}=local\n`, 'utf8');
    assert.equal(loadOptionalEnvFile(envPath), true);
    assert.equal(process.env[key], 'platform');
  } finally {
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
    await rm(directory, { recursive: true, force: true });
  }
});

test('operational launcher works without .env and preserves target argv', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'syntha-launcher-'));
  const target = path.join(directory, 'probe.mjs');
  await writeFile(target, "console.log(JSON.stringify({ argv: process.argv.slice(1), value: process.env.SYNTHA_LAUNCHER_TEST }));\n", 'utf8');
  try {
    const { stdout } = await execFileAsync(process.execPath, [
      path.join(repositoryRoot, 'scripts', 'run-with-env.mjs'),
      target,
      'one',
      'two',
    ], {
      cwd: directory,
      env: { ...process.env, SYNTHA_LAUNCHER_TEST: 'platform' },
    });
    const result = JSON.parse(stdout.trim());
    assert.deepEqual(result.argv, [target, 'one', 'two']);
    assert.equal(result.value, 'platform');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('operational launcher loads optional local values without overriding injected values', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'syntha-launcher-env-'));
  const target = path.join(directory, 'probe.mjs');
  await writeFile(path.join(directory, '.env'), 'SYNTHA_LAUNCHER_TEST=local\nSYNTHA_LOCAL_ONLY=loaded\n', 'utf8');
  await writeFile(target, "console.log(JSON.stringify({ injected: process.env.SYNTHA_LAUNCHER_TEST, local: process.env.SYNTHA_LOCAL_ONLY }));\n", 'utf8');
  try {
    const { stdout } = await execFileAsync(process.execPath, [
      path.join(repositoryRoot, 'scripts', 'run-with-env.mjs'),
      target,
    ], {
      cwd: directory,
      env: { ...process.env, SYNTHA_LAUNCHER_TEST: 'platform' },
    });
    assert.deepEqual(JSON.parse(stdout.trim()), { injected: 'platform', local: 'loaded' });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('optional local env loader rejects invalid configuration', () => {
  assert.throws(() => loadOptionalEnvFile('   '), /Environment file path is required/);
  assert.throws(() => loadOptionalEnvFile('.env', { existsSyncImpl: null }), /existence check is required/);
  assert.throws(() => loadOptionalEnvFile('.env', { loadEnvFileImpl: null }), /loader is required/);
});
