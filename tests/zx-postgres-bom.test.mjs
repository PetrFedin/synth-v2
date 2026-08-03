import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOrganisation } from '../src/modules/organisations/public.mjs';
import { createMembership } from '../src/modules/access-control/public.mjs';
import { createWholesalePlatform } from '../src/application/platform.mjs';
import { createCatalogService } from '../src/application/catalog-service.mjs';
import { createMaterialService } from '../src/application/material-service.mjs';
import { createBomService } from '../src/application/bom-service.mjs';
import { createBomQueryService } from '../src/application/bom-query-service.mjs';
import { createPostgresWholesaleStore } from '../src/infrastructure/postgres-store.mjs';
import { createPostgresCatalogStore } from '../src/infrastructure/postgres-catalog-store.mjs';
import { createPostgresMaterialStore } from '../src/infrastructure/postgres-material-store.mjs';
import { createPostgresBomStore } from '../src/infrastructure/postgres-bom-store.mjs';
import { createPostgresBomReader } from '../src/infrastructure/postgres-bom-reader.mjs';
import { migratePostgres } from '../src/infrastructure/postgres-migrator.mjs';
import { createPostgresTestPool } from './postgres-test-pool.mjs';

const databaseUrl = process.env.POSTGRES_TEST_URL;

test('PostgreSQL BOM costing persists snapshots, versions, actor isolation and publisher events', { skip: !databaseUrl }, async () => {
  const pool = createPostgresTestPool({ connectionString: databaseUrl, max: 6 });
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  let id = 0;
  let tick = 0;
  const clock = () => `2026-08-03T14:00:${String(tick++).padStart(2, '0')}.000Z`;
  const nextId = (prefix) => `${prefix}_${++id}`;
  try {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await migratePostgres({ pool, migrationsDir: path.join(root, 'db', 'migrations'), clock });

    const wholesaleStore = createPostgresWholesaleStore({ pool });
    const catalogStore = createPostgresCatalogStore({ pool });
    const materialStore = createPostgresMaterialStore({ pool });
    const bomStore = createPostgresBomStore({ pool });
    const platform = createWholesalePlatform({ store: wholesaleStore, clock, nextId });
    const catalog = createCatalogService({ wholesaleStore, catalogStore, clock, nextId });
    const materials = createMaterialService({ materialStore, clock, nextId });
    const bomCommands = createBomService({ bomStore, clock, nextId });
    const boms = Object.freeze({ ...bomCommands, ...createBomQueryService({ reader: createPostgresBomReader({ pool }) }) });

    await platform.registerOrganisation('org-create', 'system', createOrganisation({ id: 'brand-bom', type: 'brand', name: 'BOM Brand' }));
    await platform.grantMembership('member-create', 'system', createMembership({
      id: 'membership-bom', organisationId: 'brand-bom', organisationType: 'brand', userId: 'product-owner', role: 'owner', createdAt: clock(),
    }));
    const campaign = await platform.createCampaign('campaign-create', 'product-owner', {
      brandId: 'brand-bom', name: 'FW Costing', season: 'FW27', startsAt: '2027-01-01T00:00:00.000Z', endsAt: '2027-02-01T00:00:00.000Z',
    });
    await platform.openCampaign('campaign-open', 'product-owner', campaign.id);
    const collection = await platform.createCollection('collection-create', 'product-owner', {
      campaignId: campaign.id, brandId: 'brand-bom', name: 'Main', currency: 'EUR',
    });
    await platform.publishCollection('collection-publish', 'product-owner', collection.id);

    const skuDraft = await catalog.createSku('sku-create', 'product-owner', {
      sku: 'BOM-PG-1', collectionId: collection.id, brandId: 'brand-bom', name: 'Costed Jacket',
      wholesalePrice: 120, currency: 'EUR', minimumOrderQuantity: 2, availableQuantity: 30,
    });
    const sku = await catalog.publishSku('sku-publish', 'product-owner', skuDraft.sku, { expectedVersion: skuDraft.version });
    assert.equal(sku.status, 'published');

    const materialDraft = await materials.createMaterial('material-create', 'product-owner', {
      code: 'FAB-BOM-1', brandId: 'brand-bom', name: 'Wool shell', type: 'fabric', unit: 'm',
      supplierName: 'Mill One', supplierReference: 'WOOL-900', composition: '100% wool', color: 'Black',
      currency: 'EUR', unitCost: 10, minimumOrderQuantity: 50, availableQuantity: 500,
    });
    const material = await materials.publishMaterial('material-publish', 'product-owner', materialDraft.code, { expectedVersion: materialDraft.version });
    assert.equal(material.version, 2);

    const baseInput = {
      sku: sku.sku,
      currency: 'EUR',
      lines: [{ lineId: 'SHELL', component: 'Shell fabric', materialCode: material.code, quantity: 2, wastePercent: 10, exchangeRate: 1 }],
      laborCost: 5,
      overheadCost: 2,
      logisticsCost: 1,
      otherCost: 0,
      notes: 'Initial production costing',
    };
    const created = await boms.createBom('bom-create', 'product-owner', baseInput);
    assert.equal(created.materialCost, 22);
    assert.equal(created.totalCost, 30);
    assert.equal((await boms.createBom('bom-create', 'product-owner', baseInput)).id, created.id);
    await assert.rejects(() => boms.createBom('bom-create-duplicate', 'product-owner', baseInput), { code: 'BOM_ALREADY_EXISTS' });

    const updateInput = {
      expectedVersion: created.version,
      currency: 'EUR',
      lines: [{ lineId: 'SHELL', component: 'Shell fabric', materialCode: material.code, quantity: 3, wastePercent: 10, exchangeRate: 1 }],
      laborCost: 5,
      overheadCost: 2,
      logisticsCost: 1,
      otherCost: 0,
      notes: 'Revised consumption',
    };
    const updated = await boms.updateBom('bom-update', 'product-owner', sku.sku, updateInput);
    assert.equal(updated.version, 2);
    assert.equal(updated.materialCost, 33);
    assert.equal(updated.totalCost, 41);
    await assert.rejects(() => boms.updateBom('bom-update-stale', 'product-owner', sku.sku, updateInput), { code: 'BOM_CONCURRENCY_CONFLICT' });

    const page = await boms.pageForActor('product-owner', { limit: 10, q: 'BOM-PG', status: 'draft', brandId: 'brand-bom' });
    assert.equal(page.items.length, 1);
    assert.equal(page.items[0].sku, sku.sku);
    assert.equal(await boms.getForActor('outsider', sku.sku).then(() => false, (error) => error.code), 'BOM_NOT_FOUND');

    const published = await boms.publishBom('bom-publish', 'product-owner', sku.sku, { expectedVersion: updated.version });
    assert.equal(published.status, 'published');
    assert.equal(published.version, 3);
    assert.deepEqual(await boms.publishBom('bom-publish', 'product-owner', sku.sku, { expectedVersion: updated.version }), published);

    const aggregateRow = await pool.query(
      `SELECT status, currency, material_cost::text AS material_cost, total_cost::text AS total_cost, version, payload
         FROM boms WHERE sku = $1`,
      [sku.sku],
    );
    assert.deepEqual(
      { status: aggregateRow.rows[0].status, currency: aggregateRow.rows[0].currency, material_cost: aggregateRow.rows[0].material_cost, total_cost: aggregateRow.rows[0].total_cost, version: aggregateRow.rows[0].version },
      { status: 'published', currency: 'EUR', material_cost: '33.0000', total_cost: '41.0000', version: 3 },
    );
    assert.equal(aggregateRow.rows[0].payload.lines[0].materialVersion, material.version);

    const lineRows = await pool.query(
      `SELECT line_id, position, material_code, material_version, quantity::text AS quantity,
              waste_percent::text AS waste_percent, gross_quantity::text AS gross_quantity,
              unit_cost_snapshot::text AS unit_cost_snapshot, exchange_rate::text AS exchange_rate,
              line_cost::text AS line_cost
         FROM bom_lines WHERE bom_id = $1 ORDER BY position`,
      [published.id],
    );
    assert.deepEqual(lineRows.rows, [{
      line_id: 'SHELL', position: 1, material_code: material.code, material_version: material.version,
      quantity: '3.0000', waste_percent: '10.0000', gross_quantity: '3.3000',
      unit_cost_snapshot: '10.0000', exchange_rate: '1.0000', line_cost: '33.0000',
    }]);

    assert.deepEqual(
      (await pool.query("SELECT event_type FROM outbox_events WHERE event_type LIKE 'bom.%' ORDER BY event_type")).rows.map((row) => row.event_type),
      ['bom.created', 'bom.published', 'bom.updated'],
    );
  } finally {
    await pool.end();
  }
});
