import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migration = await fs.readFile(path.join(root, 'db', 'migrations', '063_buyer_catalog_projection_lineage.sql'), 'utf8');
const domain = await fs.readFile(path.join(root, 'src', 'modules', 'commercial-publication', 'public.mjs'), 'utf8');
const openApi = await fs.readFile(path.join(root, 'src', 'http', 'commercial-publication-openapi.mjs'), 'utf8');

test('PriceList and BuyerCatalog inserts preserve exact immutable projection lineage in PostgreSQL', () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION validate_price_list_projection_lineage/);
  assert.match(migration, /CREATE TRIGGER price_list_versions_projection_lineage/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION validate_buyer_catalog_projection_lineage/);
  assert.match(migration, /CREATE TRIGGER buyer_catalog_versions_projection_lineage/);
  for (const key of ['commercialProjectionId', 'commercialProjectionVersionNo', 'commercialProjectionContentHash', 'readinessSnapshotId', 'styleVersionId']) {
    assert.match(migration, new RegExp(key));
  }
  assert.match(migration, /price_list_projection_lineage/);
  assert.match(migration, /buyer_catalog_projection_lineage/);
});

test('rich PriceList and BuyerCatalog domain snapshots copy canonical projection lineage', () => {
  assert.match(domain, /\.\.\.projectionLineage\(publication\)/);
  assert.match(domain, /\.\.\.projectionLineage\(priceListVersion\)/);
  assert.match(domain, /function projectionLineage\(snapshot\)/);
});

test('commercial OpenAPI exposes canonical lineage beyond CommercialPublication', () => {
  assert.match(openApi, /const projectionLineageProperties/);
  assert.match(openApi, /PriceListVersion:[\s\S]*\.\.\.projectionLineageProperties/);
  assert.match(openApi, /BuyerCatalogVersion:[\s\S]*\.\.\.projectionLineageProperties/);
});
