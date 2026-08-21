import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migration = await fs.readFile(path.join(root, 'db', 'migrations', '064_selection_order_projection_lineage.sql'), 'utf8');
const selectionDomain = await fs.readFile(path.join(root, 'src', 'modules', 'selections', 'public.mjs'), 'utf8');
const orderDomain = await fs.readFile(path.join(root, 'src', 'modules', 'orders', 'public.mjs'), 'utf8');
const commitDomain = await fs.readFile(path.join(root, 'src', 'modules', 'order-commit', 'public.mjs'), 'utf8');
const openApi = await fs.readFile(path.join(root, 'src', 'http', 'selection-matrix-openapi.mjs'), 'utf8');

const lineageKeys = [
  'commercialProjectionId',
  'commercialProjectionVersionNo',
  'commercialProjectionContentHash',
  'readinessSnapshotId',
  'styleVersionId',
];

test('PostgreSQL guards immutable projection lineage from BuyerCatalog through Selection Order and OrderCommit', () => {
  for (const fn of [
    'validate_selection_projection_lineage',
    'validate_order_projection_lineage',
    'validate_order_commit_projection_lineage',
  ]) assert.match(migration, new RegExp(`CREATE OR REPLACE FUNCTION ${fn}`));

  for (const trigger of [
    'selections_projection_lineage_insert',
    'selections_projection_lineage_update',
    'orders_projection_lineage_insert',
    'orders_projection_lineage_update',
    'order_commit_snapshots_projection_lineage',
  ]) assert.match(migration, new RegExp(`CREATE TRIGGER ${trigger}`));

  for (const key of lineageKeys) assert.match(migration, new RegExp(key));
  assert.match(migration, /selection_projection_lineage/);
  assert.match(migration, /order_projection_lineage/);
  assert.match(migration, /order_commit_buyer_catalog_projection_lineage/);
});

test('domain snapshots carry canonical projection lineage without promoting catalogVersion to rich integrity', () => {
  for (const key of lineageKeys) {
    assert.match(selectionDomain, new RegExp(key));
    assert.match(orderDomain, new RegExp(key));
    assert.match(commitDomain, new RegExp(key));
  }
  assert.match(commitDomain, /if \(!richCatalog\) \{[\s\S]*ORDER_COMMIT_CATALOG_VERSION_MISMATCH/);
  assert.match(commitDomain, /catalogVersion remains a compatibility transport field/);
  assert.match(commitDomain, /assertCommercialProjectionLineage/);
});

test('selection matrix OpenAPI exposes canonical projection lineage and documents catalogVersion compatibility', () => {
  assert.match(openApi, /const projectionLineageProperties/);
  assert.match(openApi, /SelectionMatrixResult:[\s\S]*\.\.\.projectionLineageProperties/);
  assert.match(openApi, /Compatibility sequencing field/);
});
