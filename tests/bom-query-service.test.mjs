import assert from 'node:assert/strict';
import test from 'node:test';
import { createBomQueryService } from '../src/application/bom-query-service.mjs';

function readerFixture(pages = []) {
  const calls = [];
  return {
    calls,
    reader: {
      async pageForActor(actorId, options) {
        calls.push(['page', actorId, options]);
        return pages.shift() ?? { items: [], hasMore: false };
      },
      async getForActor(actorId, sku) {
        calls.push(['get', actorId, sku]);
        return actorId === 'allowed' ? { sku, lines: [{ lineId: 'SHELL' }] } : undefined;
      },
    },
  };
}

test('BOM query service emits filter-bound keyset cursors and immutable pages', async () => {
  const fixture = readerFixture([{ items: [{ sku: 'STYLE-001', status: 'draft', lines: [{ lineId: 'SHELL' }] }], hasMore: true, nextSku: 'STYLE-001' }]);
  const service = createBomQueryService({ reader: fixture.reader });
  const page = await service.pageForActor('allowed', { limit: '1', q: 'STYLE', status: 'draft', brandId: 'brand-1' });
  assert.equal(page.items.length, 1);
  assert.equal(typeof page.nextCursor, 'string');
  assert.equal(Object.isFrozen(page), true);
  assert.equal(Object.isFrozen(page.items[0].lines), true);

  fixture.reader.pageForActor = async (actorId, options) => {
    fixture.calls.push(['page', actorId, options]);
    return { items: [], hasMore: false };
  };
  await service.pageForActor('allowed', { limit: 1, q: 'STYLE', status: 'draft', brandId: 'brand-1', cursor: page.nextCursor });
  assert.equal(fixture.calls.at(-1)[2].afterSku, 'STYLE-001');
  await assert.rejects(
    () => service.pageForActor('allowed', { limit: 1, q: 'OTHER', status: 'draft', brandId: 'brand-1', cursor: page.nextCursor }),
    { code: 'BOM_CURSOR_INVALID' },
  );
});

test('BOM query service validates limits, filters and continuation shape', async () => {
  const fixture = readerFixture([{ items: [], hasMore: true }]);
  const service = createBomQueryService({ reader: fixture.reader });
  await assert.rejects(() => service.pageForActor('allowed', { limit: 0 }), { code: 'BOM_PAGE_LIMIT_INVALID' });
  await assert.rejects(() => service.pageForActor('allowed', { status: 'archived' }), { code: 'BOM_STATUS_FILTER_INVALID' });
  await assert.rejects(() => service.pageForActor('allowed', { q: 'x'.repeat(81) }), { code: 'BOM_SEARCH_INVALID' });
  await assert.rejects(() => service.pageForActor('allowed', {}), { code: 'BOM_PAGE_RESULT_INVALID' });
});

test('BOM detail is actor-scoped and returned as an immutable copy', async () => {
  const fixture = readerFixture();
  const service = createBomQueryService({ reader: fixture.reader });
  const item = await service.getForActor('allowed', 'STYLE-001');
  assert.equal(item.sku, 'STYLE-001');
  assert.equal(Object.isFrozen(item.lines[0]), true);
  await assert.rejects(() => service.getForActor('outsider', 'STYLE-001'), { code: 'BOM_NOT_FOUND' });
});
