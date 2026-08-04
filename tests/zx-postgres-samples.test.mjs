import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOrganisation } from '../src/modules/organisations/public.mjs';
import { createMembership } from '../src/modules/access-control/public.mjs';
import { createWholesalePlatform } from '../src/application/platform.mjs';
import { createCatalogService } from '../src/application/catalog-service.mjs';
import { createSampleService } from '../src/application/sample-service.mjs';
import { createSampleQueryService } from '../src/application/sample-query-service.mjs';
import { createPostgresWholesaleStore } from '../src/infrastructure/postgres-store.mjs';
import { createPostgresCatalogStore } from '../src/infrastructure/postgres-catalog-store.mjs';
import { createPostgresSampleStore } from '../src/infrastructure/postgres-sample-store.mjs';
import { createPostgresSampleReader } from '../src/infrastructure/postgres-sample-reader.mjs';
import { migratePostgres } from '../src/infrastructure/postgres-migrator.mjs';
import { createPostgresTestPool } from './postgres-test-pool.mjs';

const databaseUrl = process.env.POSTGRES_TEST_URL;
function sampleInput(sku, overrides = {}) {
  return {
    sampleCode: 'SMP-PG-001-FIT-R01', sku, sampleType: 'fit', round: 1,
    supplierCode: 'FACTORY-01', supplierName: 'Factory One', dueAt: '2026-08-20T12:00:00.000Z',
    quantity: 2, sizeCodes: ['S', 'M'], colourway: 'Black', notes: 'Initial fit', ...overrides,
  };
}
function editable(value) { return { supplierCode: value.supplierCode, supplierName: value.supplierName, dueAt: value.dueAt, quantity: value.quantity, sizeCodes: value.sizeCodes, colourway: value.colourway, notes: value.notes }; }

test('PostgreSQL Samples completes rejected round to traceable next round with RBAC, overdue reads and outbox', { skip: !databaseUrl }, async () => {
  const pool = createPostgresTestPool({ connectionString: databaseUrl, max: 6 });
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  let id = 0; let tick = 0;
  const baseTime = Date.parse('2026-08-04T10:00:00.000Z');
  const clock = () => new Date(baseTime + tick++ * 60_000).toISOString();
  const nextId = (prefix) => `${prefix}_${++id}`;
  try {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await migratePostgres({ pool, migrationsDir: path.join(root, 'db', 'migrations'), clock });
    const wholesaleStore = createPostgresWholesaleStore({ pool });
    const catalogStore = createPostgresCatalogStore({ pool });
    const sampleStore = createPostgresSampleStore({ pool });
    const platform = createWholesalePlatform({ store: wholesaleStore, clock, nextId });
    const catalog = createCatalogService({ wholesaleStore, catalogStore, clock, nextId });
    const samples = Object.freeze({
      ...createSampleService({ sampleStore, clock, nextId }),
      ...createSampleQueryService({ reader: createPostgresSampleReader({ pool }), clock: () => '2026-08-21T12:00:00.000Z' }),
    });

    await platform.registerOrganisation('org-create', 'system', createOrganisation({ id: 'brand-samples', type: 'brand', name: 'Samples Brand' }));
    await platform.grantMembership('member-owner', 'system', createMembership({ id: 'membership-owner', organisationId: 'brand-samples', organisationType: 'brand', userId: 'product-owner', role: 'owner', createdAt: clock() }));
    for (const [role, userId] of [['sales', 'sales-user'], ['finance', 'finance-user']]) {
      await platform.grantMembership(`member-${role}`, 'product-owner', createMembership({ id: `membership-${role}`, organisationId: 'brand-samples', organisationType: 'brand', userId, role, createdAt: clock() }));
    }
    const campaign = await platform.createCampaign('campaign-create', 'product-owner', { brandId: 'brand-samples', name: 'Samples SS', season: 'SS28', startsAt: '2027-06-01T00:00:00.000Z', endsAt: '2027-07-01T00:00:00.000Z' });
    await platform.openCampaign('campaign-open', 'product-owner', campaign.id);
    const collection = await platform.createCollection('collection-create', 'product-owner', { campaignId: campaign.id, brandId: 'brand-samples', name: 'Main', currency: 'EUR' });
    await platform.publishCollection('collection-publish', 'product-owner', collection.id);
    const skuDraft = await catalog.createSku('sku-create', 'product-owner', { sku: 'SAMPLE-PG-1', collectionId: collection.id, brandId: 'brand-samples', name: 'Fitted Jacket', wholesalePrice: 140, currency: 'EUR', minimumOrderQuantity: 2, availableQuantity: 30 });

    const firstInput = sampleInput(skuDraft.sku);
    const created = await samples.createSample('sample-create', 'product-owner', firstInput);
    await assert.rejects(() => samples.createSample('sample-sales', 'sales-user', firstInput), { code: 'CAPABILITY_DENIED' });
    const publishedSku = await catalog.publishSku('sku-publish', 'product-owner', skuDraft.sku, { expectedVersion: skuDraft.version });
    await assert.rejects(() => samples.requestSample('sample-stale-request', 'product-owner', created.sampleCode, { expectedVersion: created.version }), { code: 'SAMPLE_SKU_SNAPSHOT_STALE' });
    const rebased = await samples.updateSample('sample-rebase', 'product-owner', created.sampleCode, { expectedVersion: created.version, ...editable(firstInput) });
    assert.equal(rebased.skuVersion, publishedSku.version);

    const requested = await samples.requestSample('sample-request', 'product-owner', created.sampleCode, { expectedVersion: rebased.version });
    const overdue = await samples.pageForActor('sales-user', { overdue: true, limit: 10 });
    assert.deepEqual(overdue.items.map((item) => item.sampleCode), [created.sampleCode]);
    assert.equal((await samples.pageForActor('finance-user', { limit: 10 })).items.length, 0);
    await assert.rejects(() => samples.getForActor('finance-user', created.sampleCode), { code: 'SAMPLE_NOT_FOUND' });

    const production = await samples.startProduction('sample-production', 'product-owner', created.sampleCode, { expectedVersion: requested.version });
    const received = await samples.receiveSample('sample-receive', 'product-owner', created.sampleCode, { expectedVersion: production.version, receivedQuantity: 2, condition: 'damaged', trackingReference: 'TRACK-001', notes: 'Damaged sleeve' });
    const rejected = await samples.decideSample('sample-reject', 'product-owner', created.sampleCode, { expectedVersion: received.version, decision: 'rejected', notes: 'Sleeve balance and chest grading failed' });
    assert.equal(rejected.status, 'rejected');

    const nextInput = { expectedVersion: rejected.version, sampleCode: 'SMP-PG-001-FIT-R02', dueAt: '2026-08-28T12:00:00.000Z', notes: 'Correct sleeve and chest grading' };
    const next = await samples.createNextRound('sample-next-round', 'product-owner', rejected.sampleCode, nextInput);
    assert.equal(next.round, 2);
    assert.equal(next.sourceSampleCode, rejected.sampleCode);
    assert.equal((await samples.createNextRound('sample-next-round', 'product-owner', rejected.sampleCode, nextInput)).id, next.id);
    await assert.rejects(() => samples.createNextRound('sample-next-round-duplicate', 'product-owner', rejected.sampleCode, { ...nextInput, sampleCode: 'SMP-PG-001-FIT-R02B' }), { code: 'SAMPLE_NEXT_ROUND_EXISTS' });

    const rows = await pool.query('SELECT sample_code, sku_version, sample_type, round, status, source_sample_code, version, payload FROM samples ORDER BY round');
    assert.equal(rows.rows.length, 2);
    assert.deepEqual(rows.rows.map((row) => ({ sample_code: row.sample_code, round: row.round, status: row.status, source_sample_code: row.source_sample_code })), [
      { sample_code: 'SMP-PG-001-FIT-R01', round: 1, status: 'rejected', source_sample_code: null },
      { sample_code: 'SMP-PG-001-FIT-R02', round: 2, status: 'draft', source_sample_code: 'SMP-PG-001-FIT-R01' },
    ]);
    assert.equal(rows.rows[1].sku_version, publishedSku.version);
    assert.equal(rows.rows[1].payload.notes, 'Correct sleeve and chest grading');

    const events = (await pool.query("SELECT event_type FROM outbox_events WHERE event_type LIKE 'sample.%' ORDER BY occurred_at, id")).rows.map((row) => row.event_type);
    assert.deepEqual(events, ['sample.created', 'sample.updated', 'sample.requested', 'sample.production-started', 'sample.received', 'sample.rejected', 'sample.next-round-created']);
  } finally {
    await pool.end();
  }
});
