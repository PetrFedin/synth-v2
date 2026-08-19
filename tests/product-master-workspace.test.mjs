import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const coreSource = await readFile(new URL('../public/modules/styles-core.js', import.meta.url), 'utf8');
const uiSource = await readFile(new URL('../public/modules/styles.js', import.meta.url), 'utf8');
const readerSource = await readFile(new URL('../src/infrastructure/postgres-workspace-reader.mjs', import.meta.url), 'utf8');
const cursorSource = await readFile(new URL('../src/core/workspace-cursor.mjs', import.meta.url), 'utf8');
const pagingSource = await readFile(new URL('../public/modules/workspace-pagination.js', import.meta.url), 'utf8');
const migration = await readFile(new URL('../db/migrations/058_product_master_workspace_projection.sql', import.meta.url), 'utf8');

test('Styles registry uses canonical Product Master, Readiness and Commercial Projection truth', () => {
  new Function(coreSource)();
  const core = globalThis.SynthaStylesCore;
  const registry = core.buildRegistry({
    productStyles: [{
      id: 'style-1', brandId: 'brand-1', styleCode: 'ST-1', lifecycleStatus: 'commercial_ready',
      styleVersionId: 'style-version-1', styleVersionNo: 3, colorwayCount: 2, productSkuCount: 6,
      legacyCatalogLinkCount: 4, readinessSnapshotId: 'ready-1', readinessStatus: 'ready',
      readinessRequiredDimensionCount: 16, readinessReadyDimensionCount: 16,
      commercialProjectionId: 'projection-1', commercialProjectionVersionNo: 2, commercialProjectionStatus: 'published',
    }],
    catalogSkus: [{ sku: 'LEGACY-SHOULD-NOT-BECOME-A-STYLE', wholesalePrice: 999, availableToSell: 999 }],
  });

  assert.equal(registry.summary.total, 1);
  assert.equal(registry.summary.ready, 1);
  assert.equal(registry.summary.projected, 1);
  assert.equal(registry.summary.productSkus, 6);
  assert.equal(registry.styles[0].readinessPercent, 100);
  assert.equal(registry.styles[0].legacyCatalogLinkCount, 4);
  assert.ok(registry.styles[0].risks.some(risk => risk.code === 'LEGACY_BRIDGE_INCOMPLETE'));
  assert.doesNotMatch(coreSource, /workspace\.catalogSkus/);
  assert.doesNotMatch(coreSource, /wholesalePrice|availableToSell|minimumOrderQuantity/);
  delete globalThis.SynthaStylesCore;
});

test('Product Master workspace projection is brand-owned and version-lineage backed', () => {
  assert.match(migration, /CREATE OR REPLACE VIEW product_master_workspace/);
  assert.match(migration, /FROM product_styles ps/);
  assert.match(migration, /product_style_versions/);
  assert.match(migration, /product_readiness_snapshots/);
  assert.match(migration, /commercial_product_projection_versions/);
  assert.match(migration, /product_catalog_sku_links/);

  assert.match(readerSource, /payloadAny\(queryable, 'product_master_workspace', 'brand_id', scope\.brandIds, fetchLimit\)/);
  assert.match(readerSource, /case 'productStyles':[\s\S]*scope\.brandIds\.length[\s\S]*product_master_workspace/);
  assert.doesNotMatch(readerSource, /case 'productStyles':[\s\S]{0,300}visibleOrganisationIds/);
});

test('canonical Product Styles participate in bounded workspace pagination and UI', () => {
  assert.match(cursorSource, /'productStyles'/);
  assert.match(cursorSource, /productStyles: 2/);
  assert.match(pagingSource, /'productStyles'/);
  assert.match(uiSource, /core\.buildRegistry\(state\.workspace\)/);
  assert.match(uiSource, /Canonical Product Master/);
  assert.match(uiSource, /Commercial Projection/);
  assert.doesNotMatch(uiSource, /catalogSkuForm|odSkuActions|wholesalePrice|availableToSell/);
});
