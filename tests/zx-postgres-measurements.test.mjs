import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOrganisation } from '../src/modules/organisations/public.mjs';
import { createMembership } from '../src/modules/access-control/public.mjs';
import { createWholesalePlatform } from '../src/application/platform.mjs';
import { createCatalogService } from '../src/application/catalog-service.mjs';
import { createMeasurementService } from '../src/application/measurement-service.mjs';
import { createMeasurementQueryService } from '../src/application/measurement-query-service.mjs';
import { createPostgresWholesaleStore } from '../src/infrastructure/postgres-store.mjs';
import { createPostgresCatalogStore } from '../src/infrastructure/postgres-catalog-store.mjs';
import { createPostgresMeasurementStore } from '../src/infrastructure/postgres-measurement-store.mjs';
import { createPostgresMeasurementReader } from '../src/infrastructure/postgres-measurement-reader.mjs';
import { migratePostgres } from '../src/infrastructure/postgres-migrator.mjs';
import { createPostgresTestPool } from './postgres-test-pool.mjs';

const databaseUrl = process.env.POSTGRES_TEST_URL;
function chartInput(sku, overrides = {}) {
  return {
    sku, unit: 'cm', baseSizeCode: 'M',
    sizes: [{ code: 'S', label: 'Small' }, { code: 'M', label: 'Medium' }, { code: 'L', label: 'Large' }],
    points: [
      { pointCode: 'CHEST', name: 'Half chest', description: 'Two centimetres below armhole', toleranceMinus: 0.5, tolerancePlus: 0.75, measurements: [{ sizeCode: 'S', value: 48.5 }, { sizeCode: 'M', value: 51.5 }, { sizeCode: 'L', value: 54.5 }] },
      { pointCode: 'BODY-LEN', name: 'Body length', description: null, toleranceMinus: 0.3, tolerancePlus: 0.3, measurements: [{ sizeCode: 'S', value: 69.1 }, { sizeCode: 'M', value: 70.2 }, { sizeCode: 'L', value: 71.3 }] },
    ], notes: 'Initial measuring method', ...overrides,
  };
}

test('PostgreSQL Measurement Charts preserve matrix integrity, RBAC, versions and events', { skip: !databaseUrl }, async () => {
  const pool = createPostgresTestPool({ connectionString: databaseUrl, max: 6 });
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  let id = 0; let tick = 0;
  const baseTime = Date.parse('2026-08-04T14:00:00.000Z');
  const clock = () => new Date(baseTime + tick++ * 1000).toISOString();
  const nextId = (prefix) => `${prefix}_${++id}`;
  try {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await migratePostgres({ pool, migrationsDir: path.join(root, 'db', 'migrations'), clock });
    const wholesaleStore = createPostgresWholesaleStore({ pool });
    const catalogStore = createPostgresCatalogStore({ pool });
    const measurementStore = createPostgresMeasurementStore({ pool });
    const platform = createWholesalePlatform({ store: wholesaleStore, clock, nextId });
    const catalog = createCatalogService({ wholesaleStore, catalogStore, clock, nextId });
    const measurements = Object.freeze({ ...createMeasurementService({ measurementStore, clock, nextId }), ...createMeasurementQueryService({ reader: createPostgresMeasurementReader({ pool }) }) });

    await platform.registerOrganisation('org-create', 'system', createOrganisation({ id: 'brand-measurement', type: 'brand', name: 'Measurement Brand' }));
    await platform.grantMembership('member-owner', 'system', createMembership({ id: 'membership-owner', organisationId: 'brand-measurement', organisationType: 'brand', userId: 'product-owner', role: 'owner', createdAt: clock() }));
    for (const [role, userId] of [['sales', 'sales-user'], ['finance', 'finance-user']]) {
      await platform.grantMembership(`member-${role}`, 'product-owner', createMembership({ id: `membership-${role}`, organisationId: 'brand-measurement', organisationType: 'brand', userId, role, createdAt: clock() }));
    }
    const campaign = await platform.createCampaign('campaign-create', 'product-owner', { brandId: 'brand-measurement', name: 'SS Measurement', season: 'SS28', startsAt: '2027-06-01T00:00:00.000Z', endsAt: '2027-07-01T00:00:00.000Z' });
    await platform.openCampaign('campaign-open', 'product-owner', campaign.id);
    const collection = await platform.createCollection('collection-create', 'product-owner', { campaignId: campaign.id, brandId: 'brand-measurement', name: 'Main', currency: 'EUR' });
    await platform.publishCollection('collection-publish', 'product-owner', collection.id);
    const skuDraft = await catalog.createSku('sku-create', 'product-owner', { sku: 'MEAS-PG-1', collectionId: collection.id, brandId: 'brand-measurement', name: 'Graded Jacket', wholesalePrice: 140, currency: 'EUR', minimumOrderQuantity: 2, availableQuantity: 30 });

    const initial = chartInput(skuDraft.sku);
    const created = await measurements.createMeasurementChart('measurement-create', 'product-owner', initial);
    assert.equal(created.skuVersion, skuDraft.version);
    assert.equal(created.points[0].measurements[1].deltaFromPrevious, 3);
    assert.equal((await measurements.createMeasurementChart('measurement-create', 'product-owner', initial)).id, created.id);
    await assert.rejects(() => measurements.createMeasurementChart('measurement-sales', 'sales-user', initial), { code: 'CAPABILITY_DENIED' });

    const publishedSku = await catalog.publishSku('sku-publish', 'product-owner', skuDraft.sku, { expectedVersion: skuDraft.version });
    await assert.rejects(() => measurements.publishMeasurementChart('measurement-stale-publish', 'product-owner', created.sku, { expectedVersion: created.version }), { code: 'MEASUREMENT_SKU_SNAPSHOT_STALE' });
    const editable = chartInput(created.sku, { notes: 'Rebased after SKU publication', points: [{ ...initial.points[0], measurements: [{ sizeCode: 'S', value: 49 }, { sizeCode: 'M', value: 52.25 }, { sizeCode: 'L', value: 55.5 }] }, initial.points[1]] });
    delete editable.sku;
    const updated = await measurements.updateMeasurementChart('measurement-update', 'product-owner', created.sku, { expectedVersion: created.version, ...editable });
    assert.equal(updated.skuVersion, publishedSku.version);
    assert.equal(updated.version, 2);
    assert.equal(updated.points[0].measurements[1].deltaFromPrevious, 3.25);
    await assert.rejects(() => measurements.updateMeasurementChart('measurement-stale-update', 'product-owner', created.sku, { expectedVersion: created.version, ...editable }), { code: 'MEASUREMENT_CONCURRENCY_CONFLICT' });

    assert.equal((await measurements.getForActor('sales-user', created.sku)).sku, created.sku);
    await assert.rejects(() => measurements.getForActor('finance-user', created.sku), { code: 'MEASUREMENT_NOT_FOUND' });
    assert.equal((await measurements.pageForActor('sales-user', { limit: 10, status: 'draft', brandId: 'brand-measurement' })).items.length, 1);
    assert.equal((await measurements.pageForActor('finance-user', { limit: 10 })).items.length, 0);

    const published = await measurements.publishMeasurementChart('measurement-publish', 'product-owner', created.sku, { expectedVersion: updated.version });
    assert.equal(published.status, 'published');
    assert.equal(published.version, 3);
    const aggregate = (await pool.query('SELECT sku_version, status, unit, base_size_code, version, payload FROM measurement_charts WHERE sku = $1', [created.sku])).rows[0];
    assert.deepEqual({ sku_version: aggregate.sku_version, status: aggregate.status, unit: aggregate.unit, base_size_code: aggregate.base_size_code, version: aggregate.version }, { sku_version: publishedSku.version, status: 'published', unit: 'cm', base_size_code: 'M', version: 3 });
    assert.equal(aggregate.payload.points[0].baseValue, 52.25);

    const sizes = await pool.query('SELECT size_code, label, position FROM measurement_chart_sizes WHERE chart_id = $1 ORDER BY position', [published.id]);
    assert.deepEqual(sizes.rows, [{ size_code: 'S', label: 'Small', position: 1 }, { size_code: 'M', label: 'Medium', position: 2 }, { size_code: 'L', label: 'Large', position: 3 }]);
    const points = await pool.query("SELECT point_code, position, tolerance_minus::text AS tolerance_minus, tolerance_plus::text AS tolerance_plus, base_value::text AS base_value FROM measurement_points WHERE chart_id = $1 ORDER BY position", [published.id]);
    assert.deepEqual(points.rows, [
      { point_code: 'CHEST', position: 1, tolerance_minus: '0.5000', tolerance_plus: '0.7500', base_value: '52.2500' },
      { point_code: 'BODY-LEN', position: 2, tolerance_minus: '0.3000', tolerance_plus: '0.3000', base_value: '70.2000' },
    ]);
    const values = await pool.query("SELECT point_code, size_code, value::text AS value, delta_from_previous::text AS delta_from_previous FROM measurement_values WHERE chart_id = $1 AND point_code = 'CHEST' ORDER BY CASE size_code WHEN 'S' THEN 1 WHEN 'M' THEN 2 ELSE 3 END", [published.id]);
    assert.deepEqual(values.rows, [
      { point_code: 'CHEST', size_code: 'S', value: '49.0000', delta_from_previous: null },
      { point_code: 'CHEST', size_code: 'M', value: '52.2500', delta_from_previous: '3.2500' },
      { point_code: 'CHEST', size_code: 'L', value: '55.5000', delta_from_previous: '3.2500' },
    ]);
    assert.deepEqual((await pool.query("SELECT event_type FROM outbox_events WHERE event_type LIKE 'measurement.%' ORDER BY event_type")).rows.map((row) => row.event_type), ['measurement.created', 'measurement.published', 'measurement.updated']);
  } finally { await pool.end(); }
});
