import test from 'node:test';
import assert from 'node:assert/strict';
import { createSampleQueryService } from '../src/application/sample-query-service.mjs';
import { decodeSampleCursor } from '../src/core/sample-cursor.mjs';

const samples = [
  { sampleCode: 'SMP-A-001', sku: 'SKU-A', brandId: 'brand-1', status: 'requested', sampleType: 'fit', dueAt: '2026-08-03T00:00:00.000Z' },
  { sampleCode: 'SMP-B-001', sku: 'SKU-B', brandId: 'brand-1', status: 'in-production', sampleType: 'photo', dueAt: '2026-08-10T00:00:00.000Z' },
];
function reader() {
  const calls = [];
  return {
    calls,
    pageForActor: async (actorId, options) => { calls.push([actorId, options]); return { items: samples.slice(0, options.limit), hasMore: options.limit === 1, ...(options.limit === 1 ? { nextSampleCode: samples[0].sampleCode } : {}) }; },
    getForActor: async (_actorId, sampleCode) => samples.find((sample) => sample.sampleCode === sampleCode),
  };
}

test('overdue cursor freezes one reference time across all pages', async () => {
  const source = reader(); let tick = 0;
  const query = createSampleQueryService({ reader: source, clock: () => new Date(Date.parse('2026-08-04T12:00:00.000Z') + tick++ * 86_400_000).toISOString() });
  const first = await query.pageForActor('sales-user', { limit: 1, overdue: 'true', status: 'requested' });
  const decoded = decodeSampleCursor(first.nextCursor);
  assert.equal(decoded.asOf, '2026-08-04T12:00:00.000Z');
  await query.pageForActor('sales-user', { limit: 1, overdue: 'true', status: 'requested', cursor: first.nextCursor });
  assert.equal(source.calls[1][1].referenceTime, source.calls[0][1].referenceTime);
  assert.equal(source.calls[1][1].afterSampleCode, 'SMP-A-001');
});

test('cursor is filter-bound and malformed filters fail before reader access', async () => {
  const source = reader(); const query = createSampleQueryService({ reader: source, clock: () => '2026-08-04T12:00:00.000Z' });
  const first = await query.pageForActor('sales-user', { limit: 1, sampleType: 'fit' });
  await assert.rejects(() => query.pageForActor('sales-user', { limit: 1, sampleType: 'photo', cursor: first.nextCursor }), { code: 'SAMPLE_CURSOR_INVALID' });
  await assert.rejects(() => query.pageForActor('sales-user', { overdue: 'yes' }), { code: 'SAMPLE_OVERDUE_FILTER_INVALID' });
  assert.equal(source.calls.length, 1);
});

test('detail access is masked as not found and returned values are deeply immutable', async () => {
  const source = reader(); const query = createSampleQueryService({ reader: source, clock: () => '2026-08-04T12:00:00.000Z' });
  const found = await query.getForActor('sales-user', 'SMP-A-001');
  assert.ok(Object.isFrozen(found));
  await assert.rejects(() => query.getForActor('sales-user', 'SMP-Z-999'), { code: 'SAMPLE_NOT_FOUND' });
});

test('reader result contract rejects continuation without an item', async () => {
  const query = createSampleQueryService({ reader: { pageForActor: async () => ({ items: [], hasMore: true }), getForActor: async () => null }, clock: () => '2026-08-04T12:00:00.000Z' });
  await assert.rejects(() => query.pageForActor('sales-user'), { code: 'SAMPLE_PAGE_RESULT_INVALID' });
});
