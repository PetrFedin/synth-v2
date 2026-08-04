import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const store = await readFile(path.join(root, 'src', 'infrastructure', 'postgres-sample-store.mjs'), 'utf8');
const reader = await readFile(path.join(root, 'src', 'infrastructure', 'postgres-sample-reader.mjs'), 'utf8');

test('Sample store locks aggregate, membership and SKU inside one transaction', () => {
  assert.match(store, /memberships[\s\S]*?FOR SHARE/);
  assert.match(store, /catalog_skus[\s\S]*?FOR SHARE/);
  assert.match(store, /samples WHERE sample_code = \$1 FOR UPDATE/);
  assert.match(store, /samples WHERE source_sample_code = \$1 FOR UPDATE/);
});

test('Sample optimistic update uses contiguous placeholders and exact one-version increment', () => {
  assert.match(store, /sample\.version === expectedVersion \+ 1/);
  assert.match(store, /WHERE id = \$1 AND sample_code = \$2 AND brand_id = \$3 AND version = \$16/);
  for (let index = 1; index <= 16; index += 1) assert.ok(store.includes(`$${index}`), `missing $${index}`);
  assert.match(store, /result\.rowCount === 1/);
});

test('Sample reader enforces least-privilege actor scope and keyset pagination', () => {
  assert.match(reader, /\['owner', 'admin', 'sales'\]/);
  assert.match(reader, /sample\.sample_code > \$/);
  assert.match(reader, /ORDER BY sample\.sample_code ASC/);
  assert.doesNotMatch(reader, /OFFSET/i);
  assert.match(reader, /BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY/);
});
