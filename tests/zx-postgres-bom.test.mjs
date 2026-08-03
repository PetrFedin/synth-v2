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

test('PostgreSQL BOM lifecycle preserves snapshots, security, versions and events', { skip: !databaseUrl }, async () => {
  const pool = createPostgresTestPool({ connectionString: databaseUrl, max: 6 });
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  let id = 0; let tick = 0;
  const baseTime = Date.parse('2026-08-03T14:00:00.000Z');
  const clock = () => new Date(baseTime + tick++ * 1000).toISOString();
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
    const boms = Object.freeze({
      ...createBomService({ bomStore, clock, nextId }),
      ...createBomQueryService({ reader: createPostgresBomReader({ pool }) }),
    });

    await platform.registerOrganisation('org-create', 'system', createOrganisation({ id: 'brand-bom', type: 'brand', name: 'BOM Brand' }));
    await platform.grantMembership('member-owner', 'system', createMembership({
      id: 'membership-owner',
      organisationId: 'brand-bom',
      organisationType: 'brand',
      userId: 'product-owner',
      role: 'owner',
      createdAt: clock(),
    }));
    for (const [role, userId] of [['finance', 'finance-user'], ['sales', 'sales-user']]) {
      await platform.grantMembership(`member-${role}`, 'product-owner', createMembership({
        id: `membership-${role}`,
        organisationId: 'brand-bom',
        organisationType: 'brand',
        userId,
        role,
        createdAt: clock(),
      }));
    }
    const campaign = await platform.createCampaign('campaign-create', 'product-owner', { brandId: 'brand-bom', name: 'FW Costing', season: 'FW27', startsAt: '2027-01-01T00:00:00.000Z', endsAt: '2027-02-01T00:00:00.000Z' });
    await platform.openCampaign('campaign-open', 'product-owner', campaign.id);
    const collection = await platform.createCollection('collection-create', 'product-owner', { campaignId: campaign.id, brandId: 'brand-bom', name: 'Main', currency: 'EUR' });
    await platform.publishCollection('collection-publish', 'product-owner', collection.id);
    const skuDraft = await catalog.createSku('sku-create', 'product-owner', { sku: 'BOM-PG-1', collectionId: collection.id, brandId: 'brand-bom', name: 'Costed Jacket', wholesalePrice: 120, currency: 'EUR', minimumOrderQuantity: 2, availableQuantity: 30 });
    const sku = await catalog.publishSku('sku-publish', 'product-owner', skuDraft.sku, { expectedVersion: skuDraft.version });
    const materialDraft = await materials.createMaterial('material-create', 'product-owner', { code: 'FAB-BOM-1', brandId: 'brand-bom', name: 'Wool shell', type: 'fabric', unit: 'm', supplierName: 'Mill One', supplierReference: 'WOOL-900', composition: '100% wool', color: 'Black', currency: 'EUR', unitCost: 10, minimumOrderQuantity: 50, availableQuantity: 500 });
    const material = await materials.publishMaterial('material-publish', 'product-owner', materialDraft.code, { expectedVersion: materialDraft.version });

    const base = { sku: sku.sku, currency: 'EUR', lines: [{ lineId: 'SHELL', component: 'Shell fabric', materialCode: material.code, quantity: 2, wastePercent: 10, exchangeRate: 1 }], laborCost: 5, overheadCost: 2, logisticsCost: 1, otherCost: 0, notes: 'Initial production costing' };
    const created = await boms.createBom('bom-create', 'product-owner', base);
    assert.equal(created.materialCost, 22);
    assert.equal(created.totalCost, 30);
    assert.equal((await boms.createBom('bom-create', 'product-owner', base)).id, created.id);
    await assert.rejects(() => boms.createBom('bom-sales', 'sales-user', { ...base, sku: 'BOM-PG-1' }), { code: 'CAPABILITY_DENIED' });

    const editable = { expectedVersion: 1, currency: 'EUR', lines: [{ lineId: 'SHELL', component: 'Shell fabric', materialCode: material.code, quantity: 3, wastePercent: 10, exchangeRate: 1 }], laborCost: 5, overheadCost: 2, logisticsCost: 1, otherCost: 0, notes: 'Revised consumption' };
    const updated = await boms.updateBom('bom-update', 'product-owner', sku.sku, editable);
    assert.equal(updated.materialCost, 33);
    assert.equal(updated.totalCost, 41);
    await assert.rejects(() => boms.updateBom('bom-stale', 'product-owner', sku.sku, editable), { code: 'BOM_CONCURRENCY_CONFLICT' });

    assert.equal((await boms.getForActor('finance-user', sku.sku)).sku, sku.sku);
    await assert.rejects(() => boms.getForActor('sales-user', sku.sku), { code: 'BOM_NOT_FOUND' });
    const financePage = await boms.pageForActor('finance-user', { limit: 10, status: 'draft', brandId: 'brand-bom' });
    assert.equal(financePage.items.length, 1);
    assert.equal((await boms.pageForActor('sales-user', { limit: 10 })).items.length, 0);

    const published = await boms.publishBom('bom-publish', 'product-owner', sku.sku, { expectedVersion: updated.version });
    assert.equal(published.status, 'published');
    assert.equal(published.version, 3);
    const aggregate = (await pool.query(`SELECT material_cost::text AS material_cost, total_cost::text AS total_cost, version, payload FROM boms WHERE sku = $1`, [sku.sku])).rows[0];
    assert.deepEqual({ material_cost: aggregate.material_cost, total_cost: aggregate.total_cost, version: aggregate.version }, { material_cost: '33.0000', total_cost: '41.0000', version: 3 });
    assert.equal(aggregate.payload.lines[0].materialVersion, material.version);
    const lines = await pool.query(`SELECT line_id, material_code, material_version, quantity::text AS quantity, gross_quantity::text AS gross_quantity, unit_cost_snapshot::text AS unit_cost_snapshot, line_cost::text AS line_cost FROM bom_lines WHERE bom_id = $1`, [published.id]);
    assert.deepEqual(lines.rows, [{ line_id: 'SHELL', material_code: material.code, material_version: material.version, quantity: '3.0000', gross_quantity: '3.3000', unit_cost_snapshot: '10.0000', line_cost: '33.0000' }]);
    assert.deepEqual((await pool.query("SELECT event_type FROM outbox_events WHERE event_type LIKE 'bom.%' ORDER BY event_type")).rows.map((row) => row.event_type), ['bom.created', 'bom.published', 'bom.updated']);
  } finally {
    await pool.end();
  }
});
