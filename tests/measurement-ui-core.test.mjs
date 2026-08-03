import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = await readFile(path.join(root, 'public', 'modules', 'measurement-core.js'), 'utf8');
const context = vm.createContext({ globalThis: {} });
vm.runInContext(source, context, { filename: 'measurement-core.js' });
const core = context.globalThis.SynthaMeasurementCore;
const plain = (value) => JSON.parse(JSON.stringify(value));

function chart(overrides = {}) {
  return {
    id: 'measurement-1', sku: 'STYLE-001', brandId: 'brand-1', skuVersion: 2, unit: 'cm', baseSizeCode: 'M',
    sizes: [{ code: 'S', label: 'Small', position: 1 }, { code: 'M', label: 'Medium', position: 2 }],
    points: [{
      pointCode: 'CHEST', position: 1, name: 'Half chest', description: null, toleranceMinus: 0.5, tolerancePlus: 0.5, baseValue: 51,
      measurements: [{ sizeCode: 'S', value: 48, deltaFromPrevious: null }, { sizeCode: 'M', value: 51, deltaFromPrevious: 3 }],
    }],
    notes: null, status: 'draft', version: 1, publishedAt: null,
    createdAt: '2026-08-04T10:00:00.000Z', updatedAt: '2026-08-04T10:00:00.000Z',
    ...overrides,
  };
}
const sku = { sku: 'STYLE-001', brandId: 'brand-1', status: 'published', version: 2 };

test('ready draft receives a publish gate without publication points', () => {
  const result = core.assessChart(chart(), [sku]);
  assert.equal(result.readiness, 90);
  assert.equal(result.publishReady, true);
  assert.deepEqual(plain(result.risks.map((risk) => risk.code)), ['CHART_NOT_PUBLISHED']);
  assert.equal(result.expectedValues, 2);
  assert.equal(result.actualValues, 2);
});

test('published complete chart reaches full readiness', () => {
  const result = core.assessChart(chart({ status: 'published', version: 2, publishedAt: '2026-08-04T11:00:00.000Z' }), [sku]);
  assert.equal(result.readiness, 100);
  assert.equal(result.publishReady, false);
  assert.equal(result.risks.length, 0);
});

test('stale and incomplete charts expose actionable risks', () => {
  const incomplete = chart({
    skuVersion: 1,
    points: [{ ...chart().points[0], measurements: [{ sizeCode: 'M', value: 51, deltaFromPrevious: null }] }],
  });
  const result = core.assessChart(incomplete, [sku]);
  assert.equal(result.publishReady, false);
  assert.equal(result.missingValues, 1);
  assert.ok(result.risks.some((risk) => risk.code === 'MATRIX_INCOMPLETE'));
  assert.ok(result.risks.some((risk) => risk.code === 'SKU_SNAPSHOT_STALE'));
  assert.ok(result.readiness < 90);
});

test('registry prioritizes critical records and computes production metrics', () => {
  const critical = chart({ id: 'bad', sku: 'STYLE-999', brandId: 'brand-9', sizes: [], points: [] });
  const registry = core.buildRegistry([chart(), chart({ id: 'published', status: 'published' }), critical], [sku]);
  assert.equal(registry.items[0].chart.id, 'bad');
  assert.deepEqual(plain({
    total: registry.summary.total,
    draft: registry.summary.draft,
    published: registry.summary.published,
    publishReady: registry.summary.publishReady,
    critical: registry.summary.critical,
  }), { total: 3, draft: 2, published: 1, publishReady: 1, critical: 1 });
  assert.ok(Object.isFrozen(registry));
  assert.ok(Object.isFrozen(registry.items));
});
