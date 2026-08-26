import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { loadOptionalEnvFile } from '../src/runtime/local-env.mjs';

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

test('optional local env loader rejects invalid configuration', () => {
  assert.throws(() => loadOptionalEnvFile('   '), /Environment file path is required/);
  assert.throws(() => loadOptionalEnvFile('.env', { existsSyncImpl: null }), /existence check is required/);
  assert.throws(() => loadOptionalEnvFile('.env', { loadEnvFileImpl: null }), /loader is required/);
});
