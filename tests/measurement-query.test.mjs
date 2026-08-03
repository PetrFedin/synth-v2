import test from 'node:test';
import assert from 'node:assert/strict';
import { createMeasurementQueryService } from '../src/application/measurement-query-service.mjs';

const charts = [
  { sku: 'STYLE-001', brandId: 'brand-1', status: 'draft', unit: 'cm', sizes: [], points: [] },
  { sku: 'STYLE-002', brandId: 'brand-1', status: 'published', unit: 'cm', sizes: [], points: [] },
  { sku: 'STYLE-003', brandId: 'brand-2', status: 'published', unit: 'in', sizes: [], points: [] },
];

function reader() {
  const calls = [];
  return {
    calls,
    async pageForActor(actorId, { limit, afterSku, filters }) {
      calls.push({ actorId, limit, afterSku, filters });
      let items = charts.filter((chart) => !afterSku || chart.sku > afterSku);
      if (filters.status) items = items.filter((chart) => chart.status === filters.status);
      if (filters.unit) items = items.filter((chart) => chart.unit === filters.unit);
      if (filters.brandId) items = items.filter((chart) => chart.brandId === filters.brandId);
      if (filters.q) items = items.filter((chart) => chart.sku.toLowerCase().startsWith(filters.q.toLowerCase()));
      const page = items.slice(0, limit + 1);
      return { items: page.slice(0, limit), hasMore: page.length > limit, ...(page.length > limit ? { nextSku: page[limit - 1].sku } : {}) };
    },
    async getForActor(_actorId, sku) { return charts.find((chart) => chart.sku === sku); },
  };
}

test('measurement queries use filter-bound keyset cursors and immutable pages', async () => {
  const fixture = reader();
  const service = createMeasurementQueryService({ reader: fixture });
  const first = await service.pageForActor('sales-user', { limit: 1, status: 'published', unit: 'cm', brandId: 'brand-1' });
  assert.deepEqual(first.items.map((item) => item.sku), ['STYLE-002']);
  assert.equal(first.nextCursor, null);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.items));

  const broad = await service.pageForActor('sales-user', { limit: 2 });
  assert.deepEqual(broad.items.map((item) => item.sku), ['STYLE-001', 'STYLE-002']);
  assert.equal(typeof broad.nextCursor, 'string');
  const second = await service.pageForActor('sales-user', { limit: 2, cursor: broad.nextCursor });
  assert.deepEqual(second.items.map((item) => item.sku), ['STYLE-003']);
  assert.equal(fixture.calls.at(-1).afterSku, 'STYLE-002');
  await assert.rejects(() => service.pageForActor('sales-user', { limit: 2, status: 'published', cursor: broad.nextCursor }), { code: 'MEASUREMENT_CURSOR_INVALID' });
});

test('measurement detail reads normalize SKU and mask missing or inaccessible rows', async () => {
  const service = createMeasurementQueryService({ reader: reader() });
  const chart = await service.getForActor('sales-user', 'STYLE-002');
  assert.equal(chart.sku, 'STYLE-002');
  assert.ok(Object.isFrozen(chart));
  await assert.rejects(() => service.getForActor('sales-user', 'missing'), { code: 'MEASUREMENT_SKU_INVALID' });
  await assert.rejects(() => service.getForActor('sales-user', 'STYLE-999'), { code: 'MEASUREMENT_NOT_FOUND' });
});

test('measurement page inputs reject oversized limits and unsupported filters', async () => {
  const service = createMeasurementQueryService({ reader: reader() });
  await assert.rejects(() => service.pageForActor('sales-user', { limit: 201 }), { code: 'MEASUREMENT_PAGE_LIMIT_INVALID' });
  await assert.rejects(() => service.pageForActor('sales-user', { status: 'archived' }), { code: 'MEASUREMENT_STATUS_FILTER_INVALID' });
  await assert.rejects(() => service.pageForActor('sales-user', { unit: 'mm' }), { code: 'MEASUREMENT_UNIT_FILTER_INVALID' });
});
