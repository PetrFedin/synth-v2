import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRuntimeIdGenerator, resolveRuntimeIdGenerator } from '../src/runtime/id-generator.mjs';

const UUIDS = [
  '123e4567-e89b-42d3-a456-426614174000',
  '123e4567-e89b-42d3-a456-426614174001',
];

test('runtime ids are collision-resistant across service prefixes', () => {
  let index = 0;
  const nextId = createRuntimeIdGenerator({ randomUuid: () => UUIDS[index++] });
  assert.equal(nextId('event'), `event_${UUIDS[0]}`);
  assert.equal(nextId('notification'), `notification_${UUIDS[1]}`);
});

test('runtime id generator rejects unsafe prefixes and invalid UUID sources', () => {
  const nextId = createRuntimeIdGenerator({ randomUuid: () => UUIDS[0] });
  assert.throws(() => nextId('Event'), (error) => error.code === 'RUNTIME_ID_PREFIX_INVALID');
  const malformed = createRuntimeIdGenerator({ randomUuid: () => 'not-a-uuid' });
  assert.throws(() => malformed('event'), (error) => error.code === 'RUNTIME_ID_SOURCE_INVALID');
  const failed = createRuntimeIdGenerator({ randomUuid: () => { throw new Error('rng failed'); } });
  assert.throws(() => failed('event'), (error) => error.code === 'RUNTIME_ID_SOURCE_INVALID');
});

test('runtime preserves an explicitly injected deterministic generator', () => {
  const custom = (prefix) => `${prefix}_deterministic`;
  assert.equal(resolveRuntimeIdGenerator(custom), custom);
  assert.throws(() => resolveRuntimeIdGenerator(null), (error) => error.code === 'RUNTIME_ID_GENERATOR_INVALID');
});

test('default runtime ids remain unique within a production process', () => {
  const nextId = resolveRuntimeIdGenerator(undefined);
  const values = new Set(Array.from({ length: 1000 }, () => nextId('event')));
  assert.equal(values.size, 1000);
});

test('PostgreSQL runtime injects one shared generator into every id-producing service', async () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const source = await readFile(path.join(root, 'src', 'runtime', 'postgres-runtime.mjs'), 'utf8');
  assert.match(source, /const runtimeNextId = resolveRuntimeIdGenerator\(nextId\)/);
  assert.match(source, /createAuthService\([\s\S]*?nextId: runtimeNextId/);
  assert.match(source, /createCatalogService\([\s\S]*?nextId: runtimeNextId/);
  assert.match(source, /createNotificationService\([\s\S]*?nextId: runtimeNextId/);
  assert.match(source, /const options = \{ store, nextId: runtimeNextId/);
  assert.doesNotMatch(source, /\.\.\.\(nextId \? \{ nextId \} : \{\}\)/);
});
