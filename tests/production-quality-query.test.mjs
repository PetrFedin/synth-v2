import test from 'node:test';
import assert from 'node:assert/strict';
import { createProductionQualityQueryService } from '../src/application/production-quality-query-service.mjs';

const quality = (code, status = 'planned') => ({ qualityCaseCode: code, status, brandId: 'brand-1', supplierCode: 'FACTORY-01', sku: 'STYLE-001', rounds: [{ round: 1, status: 'planned' }] });

test('Production Quality query uses filter-bound keyset cursors and immutable results', async () => {
  const calls = [];
  const reader = {
    async pageForActor(actorId, options) {
      calls.push([actorId, options]);
      if (options.afterQualityCaseCode) return { items: [quality('QC-EXEC-003')], hasMore: false };
      return { items: [quality('QC-EXEC-001'), quality('QC-EXEC-002')], hasMore: true, nextQualityCaseCode: 'QC-EXEC-002' };
    },
    async getForActor() { return quality('QC-EXEC-001'); },
  };
  const service = createProductionQualityQueryService({ reader });
  const first = await service.pageForActor('actor-1', { limit: '2', status: 'planned', brandId: 'brand-1' });
  assert.equal(first.items.length, 2);
  assert.equal(typeof first.nextCursor, 'string');
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.items[0].rounds), true);
  const second = await service.pageForActor('actor-1', { limit: 2, status: 'planned', brandId: 'brand-1', cursor: first.nextCursor });
  assert.deepEqual(second.items.map((value) => value.qualityCaseCode), ['QC-EXEC-003']);
  assert.equal(calls[1][1].afterQualityCaseCode, 'QC-EXEC-002');
  await assert.rejects(() => service.pageForActor('actor-1', { limit: 2, status: 'passed', brandId: 'brand-1', cursor: first.nextCursor }), { code: 'PRODUCTION_QUALITY_CURSOR_INVALID' });
});

test('Production Quality query validates filters and masks inaccessible detail as not found', async () => {
  const service = createProductionQualityQueryService({ reader: { pageForActor: async () => ({ items: [], hasMore: false }), getForActor: async () => undefined } });
  await assert.rejects(() => service.pageForActor('actor-1', { limit: '0' }), { code: 'PRODUCTION_QUALITY_PAGE_LIMIT_INVALID' });
  await assert.rejects(() => service.pageForActor('actor-1', { status: 'released' }), { code: 'PRODUCTION_QUALITY_STATUS_FILTER_INVALID' });
  await assert.rejects(() => service.getForActor('actor-1', 'QC-EXEC-404'), { code: 'PRODUCTION_QUALITY_NOT_FOUND' });
});
