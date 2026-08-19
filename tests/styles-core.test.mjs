import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../public/modules/styles-core.js', import.meta.url), 'utf8');
const context = vm.createContext({ console, Object, Array, Math, String, Number, globalThis: {} });
context.globalThis = context;
vm.runInContext(source, context, { filename: 'styles-core.js' });
const core = context.SynthaStylesCore;

const readyProduct = Object.freeze({
  id: 'style-1', brandId: 'brand-1', styleCode: 'STYLE-001', lifecycleStatus: 'commercial_ready',
  styleVersionId: 'style-version-1', styleVersionNo: 2, colorwayCount: 2, productSkuCount: 6,
  legacyCatalogLinkCount: 6, readinessSnapshotId: 'readiness-1', readinessStatus: 'ready',
  readinessRequiredDimensionCount: 16, readinessReadyDimensionCount: 16, readinessBlockedDimensionCount: 0,
  commercialProjectionId: 'projection-1', commercialProjectionVersionNo: 1, commercialProjectionStatus: 'published',
});

test('marks governed ready Product Master as fully ready and projected', () => {
  const result = core.assessStyle(readyProduct);
  assert.equal(result.readinessPercent, 100);
  assert.equal(result.readinessReady, true);
  assert.equal(result.projected, true);
  assert.equal(result.risks.length, 0);
});

test('fails closed when canonical variants or readiness evidence are missing', () => {
  const result = core.assessStyle({ ...readyProduct, colorwayCount: 0, productSkuCount: 0, readinessSnapshotId: null, readinessStatus: null, commercialProjectionId: null, commercialProjectionStatus: null });
  assert.equal(result.risks.some((item) => item.code === 'COLORWAYS_MISSING'), true);
  assert.equal(result.risks.some((item) => item.code === 'PRODUCT_SKUS_MISSING'), true);
  assert.equal(result.risks.some((item) => item.code === 'READINESS_NOT_ASSESSED'), true);
  assert.equal(result.readinessReady, false);
});

test('uses governed readiness counters rather than price or ATS heuristics', () => {
  const result = core.assessStyle({ ...readyProduct, readinessStatus: 'blocked', readinessReadyDimensionCount: 12, readinessBlockedDimensionCount: 4, commercialProjectionId: null, commercialProjectionStatus: null, wholesalePrice: 999, availableToSell: 999 });
  assert.equal(result.readinessPercent, 75);
  assert.equal(result.risks.some((item) => item.code === 'READINESS_BLOCKED'), true);
  assert.equal(result.projected, false);
});

test('treats flat catalog linkage only as migration evidence', () => {
  const result = core.assessStyle({ ...readyProduct, legacyCatalogLinkCount: 4 });
  assert.equal(result.risks.some((item) => item.code === 'LEGACY_BRIDGE_INCOMPLETE'), true);
  assert.equal(result.readinessReady, true);
  assert.equal(result.projected, true);
});

test('registry ignores legacy flat catalog rows as Product Master input', () => {
  const registry = core.buildRegistry({ productStyles: [readyProduct], catalogSkus: [{ sku: 'LEGACY-1', wholesalePrice: 1, availableToSell: 1 }] });
  assert.equal(registry.summary.total, 1);
  assert.equal(registry.summary.productSkus, 6);
  assert.equal(registry.summary.ready, 1);
  assert.equal(registry.summary.projected, 1);
});
