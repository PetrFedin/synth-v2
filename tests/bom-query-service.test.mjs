import assert from 'node:assert/strict';
import test from 'node:test';
import { createBomQueryService } from '../src/application/bom-query-service.mjs';

function fixture(pages = []) {
  const calls = [];
  return {
    calls,
    reader: {
      pageForActor: async (actorId, options) => { calls.push(['page', actorId, options]); return pages.shift() ?? { items: [], hasMore: false }; },
      getForActor: async (actorId, sku) => { calls.push(['get', actorId, sku]); return actorId === 'allowed' ? { sku, lines: [{ lineId: 'SHELL' }] } : undefined; },
    },
  };
}

test('emits immutable filter-bound keyset pages', async () => {
  const source = fixture([{ items: [{ sku: 'STYLE-001', status: 'draft', lines: [{ lineId: 'SHELL' }] }], hasMore: true, nextSku: 'STYLE-001' }]);
  const service = createBomQueryService({ reader: source.reader });
  const page = await service.pageForActor('allowed', { limit: '1', q: 'STYLE', status: 'draft', brandId: 'brand-1' });
  assert.equal(typeof page.nextCursor, 'string');
  assert.equal(Object.isFrozen(page.items[0].lines), true);
  source.reader.pageForActor = async (actorId, options) => { source.calls.push(['page', actorId, options]); return { items: [], hasMore: false }; };
  await service.pageForActor('allowed', { limit: 1, q: 'STYLE', status: 'draft', brandId: 'brand-1', cursor: page.nextCursor });
  assert.equal(source.calls.at(-1)[2].afterSku, 'STYLE-001');
  await assert.rejects(() => service.pageForActor('allowed', { limit: 1, q: 'OTHER', status: 'draft', brandId: 'brand-1', cursor: page.nextCursor }), { code: 'BOM_CURSOR_INVALID' });
});

test('validates query bounds and masks inaccessible detail as not found', async () => {
  const source = fixture([{ items: [], hasMore: true }]);
  const service = createBomQueryService({ reader: source.reader });
  await assert.rejects(() => service.pageForActor('allowed', { limit: 0 }), { code: 'BOM_PAGE_LIMIT_INVALID' });
  await assert.rejects(() => service.pageForActor('allowed', { status: 'archived' }), { code: 'BOM_STATUS_FILTER_INVALID' });
  await assert.rejects(() => service.pageForActor('allowed', {}), { code: 'BOM_PAGE_RESULT_INVALID' });
  const item = await service.getForActor('allowed', 'STYLE-001');
  assert.equal(Object.isFrozen(item.lines[0]), true);
  await assert.rejects(() => service.getForActor('outsider', 'STYLE-001'), { code: 'BOM_NOT_FOUND' });
});
