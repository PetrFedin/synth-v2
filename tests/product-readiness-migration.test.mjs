import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migration = await fs.readFile(path.join(root, 'db', 'migrations', '055_product_readiness_commercial_projection.sql'), 'utf8');

test('readiness migration freezes exactly 18 governed dimensions and route-aware snapshots', () => {
  assert.match(migration, /CREATE TABLE product_readiness_snapshots/);
  assert.match(migration, /jsonb_array_length\(dimensions\) = 18/);
  for (const code of [
    'product_identity','category','colorways','size_scale','sku_matrix','product_attributes','bom','measurements','samples','tech_pack','sourcing','purchase_or_production_commitment','quality','compliance','commercial_media','commercial_content','commercial_terms','availability_delivery',
  ]) assert.match(migration, new RegExp(`'${code}'`));
  assert.match(migration, /development_route IN \('OWN_DEVELOPMENT','MATERIALS_SEPARATE','READY_GOODS'\)/);
  assert.match(migration, /product_readiness_snapshots_immutable/);
});

test('commercial projection can only publish exact ready frozen handoff with contiguous lineage', () => {
  assert.match(migration, /CREATE TABLE commercial_product_projection_versions/);
  assert.match(migration, /readiness\.readiness_status <> 'ready'/);
  assert.match(migration, /NEW\.payload -> 'technicalSnapshot' IS DISTINCT FROM readiness\.technical_snapshot/);
  assert.match(migration, /NEW\.payload -> 'commercialPreparation' IS DISTINCT FROM readiness\.commercial_preparation_snapshot/);
  assert.match(migration, /source_row\.version_no \+ 1 <> NEW\.version_no/);
  assert.match(migration, /commercial_product_projection_versions_immutable/);
});

test('readiness and projection writes publish through the unified transactional outbox', () => {
  assert.match(migration, /INSERT INTO outbox_events/);
  assert.match(migration, /ProductReadinessSnapshotCreated/);
  assert.match(migration, /CommercialProductProjectionPublished/);
});

test('dimension validator avoids unsafe boolean casts and names the unnest column explicitly', () => {
  assert.match(migration, /WHEN jsonb_typeof\(value -> 'required'\) = 'boolean'/);
  assert.match(migration, /FROM unnest\(expected_codes\) AS item\(code\)/);
});
