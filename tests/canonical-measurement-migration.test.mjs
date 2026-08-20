import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../db/migrations/060_canonical_measurement_mdm.sql', import.meta.url);
const readinessSourceUrl = new URL('../src/infrastructure/postgres-product-readiness-source-reader.mjs', import.meta.url);

test('migration 060 pins Measurement Chart to Product Identity and exact governed MDM versions', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  for (const fragment of [
    'style_version_id text NULL',
    'colorway_id text NULL',
    'size_scale_version_id text NULL',
    'measurement_unit_entry_id text NULL',
    'measurement_unit_entry_version integer NULL',
    'base_size_value_id text NULL',
    'size_value_id text NULL',
    'point_entry_id text NULL',
    'point_entry_version integer NULL',
    'REFERENCES mdm_entry_versions(entry_id, version)',
    'measurement_charts_canonical_context_uidx',
  ]) assert.match(sql, new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

  assert.match(sql, /DROP CONSTRAINT IF EXISTS measurement_charts_sku_fkey/);
  assert.match(sql, /sku IS NULL[\s\S]*style_version_id IS NOT NULL[\s\S]*measurement_unit_entry_version IS NOT NULL/);
});

test('Product Readiness sources Measurement evidence from canonical Product Identity columns, not flat catalog SKU', async () => {
  const source = await readFile(readinessSourceUrl, 'utf8');
  const measurementQuery = source.match(/const measurementResult = await pool\.query\([\s\S]*?\n\s*\);/)?.[0] ?? '';
  assert.ok(measurementQuery.length > 0, 'canonical measurement readiness query must exist');
  assert.match(measurementQuery, /chart\.style_version_id = \$1/);
  assert.match(measurementQuery, /chart\.measurement_unit_entry_version/);
  assert.match(measurementQuery, /chart\.base_size_value_id/);
  assert.match(measurementQuery, /chart_size\.size_value_id/);
  assert.doesNotMatch(measurementQuery, /chart\.sku\s*=|catalog_skus|product_catalog_sku_links/);
});
