import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migration = await fs.readFile(path.join(root, 'db', 'migrations', '056_projection_backed_commercial_publication.sql'), 'utf8');

test('new publications require exact immutable Commercial Product Projection while historical rows remain readable', () => {
  assert.match(migration, /ADD COLUMN commercial_projection_id text NULL/);
  assert.match(migration, /REFERENCES commercial_product_projection_versions\(id\)/);
  assert.match(migration, /IF NEW\.commercial_projection_id IS NULL/);
  assert.match(migration, /commercial_publication_projection_required/);
});

test('database independently verifies projection lineage and variant-rich payload', () => {
  assert.match(migration, /projection\.brand_id <> NEW\.brand_id/);
  assert.match(migration, /commercialProjectionContentHash/);
  assert.match(migration, /styleVersionId/);
  assert.match(migration, /jsonb_typeof\(NEW\.payload -> 'styles'\)/);
  assert.match(migration, /jsonb_array_length\(NEW\.payload -> 'styles'\) < 1/);
});
