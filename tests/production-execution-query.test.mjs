import test from 'node:test';
import assert from 'node:assert/strict';
import { createProductionExecutionQueryService } from '../src/application/production-execution-query-service.mjs';

const execution = (code, status = 'active') => ({ executionCode: code, status, brandId: 'brand-1', supplierCode: 'FACTORY-01', sku: 'STYLE-001', milestones: [{ code: 'materials-ready', status: 'pending' }] });

test('Production Execution query uses bound keyset cursors and immutable results', async () => {
  const calls = [];
  const reader = {
    async pageForActor(actorId, options) {
      calls.push([actorId, options]);
      if (options.afterExecutionCode) return { items: [execution('EXEC-PO-003')], hasMore: false };
      return { items: [execution('EXEC-PO-001'), execution('EXEC-PO-002')], hasMore: true, nextExecutionCode: 'EXEC-PO-002' };
    },
    async getForActor() { return execution('EXEC-PO-001'); },
  };
  const service = createProductionExecutionQueryService({ reader });
  const first = await service.pageForActor('actor-1', { limit: '2', status: 'active', brandId: 'brand-1' });
  assert.equal(first.items.length, 2);
  assert.equal(typeof first.nextCursor, 'string');
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.items), true);
  assert.equal(Object.isFrozen(first.items[0].milestones), true);

  const second = await service.pageForActor('actor-1', { limit: 2, status: 'active', brandId: 'brand-1', cursor: first.nextCursor });
  assert.deepEqual(second.items.map((value) => value.executionCode), ['EXEC-PO-003']);
  assert.equal(calls[1][1].afterExecutionCode, 'EXEC-PO-002');
  await assert.rejects(() => service.pageForActor('actor-1', { limit: 2, status: 'planned', brandId: 'brand-1', cursor: first.nextCursor }), { code: 'PRODUCTION_EXECUTION_CURSOR_INVALID' });
});

test('Production Execution query validates filters and masks inaccessible detail as not found', async () => {
  const service = createProductionExecutionQueryService({ reader: { pageForActor: async () => ({ items: [], hasMore: false }), getForActor: async () => undefined } });
  await assert.rejects(() => service.pageForActor('actor-1', { limit: '0' }), { code: 'PRODUCTION_EXECUTION_PAGE_LIMIT_INVALID' });
  await assert.rejects(() => service.pageForActor('actor-1', { status: 'finished' }), { code: 'PRODUCTION_EXECUTION_STATUS_FILTER_INVALID' });
  await assert.rejects(() => service.getForActor('actor-1', 'EXEC-PO-404'), { code: 'PRODUCTION_EXECUTION_NOT_FOUND' });
});
