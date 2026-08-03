import test from 'node:test';
import assert from 'node:assert/strict';
import { createCatalogQueryService } from '../src/application/catalog-query-service.mjs';

function sku(code, overrides = {}) {
  return {
    id: code,
    sku: code,
    collectionId: 'collection_1',
    brandId: 'brand_1',
    name: `Product ${code}`,
    wholesalePrice: 100,
    currency: 'USD',
    minimumOrderQuantity: 1,
    availableQuantity: 10,
    reservedQuantity: 0,
    availableToSell: 10,
    status: 'published',
    version: 1,
    publishedAt: '2026-08-03T00:00:00.000Z',
    createdAt: '2026-08-03T00:00:00.000Z',
    updatedAt: '2026-08-03T00:00:00.000Z',
    ...overrides,
  };
}

test('catalog query service normalizes filters and returns filter-bound continuation cursor', async () => {
  const calls = [];
  const service = createCatalogQueryService({
    reader: {
      async pageForActor(actorId, input) {
        calls.push({ actorId, input });
        return { items: [sku('SKU-01'), sku('SKU-02')], hasMore: true, nextSku: 'SKU-02' };
      },
      async getForActor() { return undefined; },
    },
  });

  const first = await service.pageForActor('actor_1', {
    limit: '2',
    q: '  Summer   Dress ',
    status: 'published',
    brandId: 'brand_1',
    collectionId: 'collection_1',
  });
  assert.equal(first.items.length, 2);
  assert.equal(typeof first.nextCursor, 'string');
  assert.deepEqual(calls[0], {
    actorId: 'actor_1',
    input: {
      limit: 2,
      afterSku: undefined,
      filters: {
        q: 'Summer Dress',
        status: 'published',
        brandId: 'brand_1',
        collectionId: 'collection_1',
      },
    },
  });

  await service.pageForActor('actor_1', {
    limit: 2,
    q: 'Summer Dress',
    status: 'published',
    brandId: 'brand_1',
    collectionId: 'collection_1',
    cursor: first.nextCursor,
  });
  assert.equal(calls[1].input.afterSku, 'SKU-02');

  await assert.rejects(
    () => service.pageForActor('actor_1', { q: 'Winter', cursor: first.nextCursor }),
    (error) => error?.code === 'CATALOG_CURSOR_INVALID',
  );
});

test('catalog query service rejects invalid limits, filters and reader pages', async () => {
  const reader = {
    async pageForActor() { return { items: [], hasMore: true }; },
    async getForActor() { return undefined; },
  };
  const service = createCatalogQueryService({ reader });
  for (const [input, code] of [
    [{ limit: 0 }, 'CATALOG_PAGE_LIMIT_INVALID'],
    [{ limit: '2.5' }, 'CATALOG_PAGE_LIMIT_INVALID'],
    [{ q: ' '.repeat(2) }, 'CATALOG_SEARCH_INVALID'],
    [{ status: 'archived' }, 'CATALOG_STATUS_FILTER_INVALID'],
    [{ brandId: 'bad id' }, 'CATALOG_BRAND_FILTER_INVALID'],
    [{ collectionId: 'bad/id' }, 'CATALOG_COLLECTION_FILTER_INVALID'],
  ]) {
    await assert.rejects(() => service.pageForActor('actor_1', input), (error) => error?.code === code);
  }
  await assert.rejects(
    () => service.pageForActor('actor_1'),
    (error) => error?.code === 'CATALOG_PAGE_RESULT_INVALID',
  );
});

test('catalog detail is actor-scoped and returns immutable data', async () => {
  const source = sku('SKU-01', { nested: { value: 1 } });
  const service = createCatalogQueryService({
    reader: {
      async pageForActor() { return { items: [], hasMore: false }; },
      async getForActor(actorId, code) {
        assert.equal(actorId, 'actor_1');
        assert.equal(code, 'SKU-01');
        return source;
      },
    },
  });
  const result = await service.getForActor('actor_1', 'SKU-01');
  assert.notEqual(result, source);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.nested), true);

  const missing = createCatalogQueryService({
    reader: {
      async pageForActor() { return { items: [], hasMore: false }; },
      async getForActor() { return undefined; },
    },
  });
  await assert.rejects(
    () => missing.getForActor('actor_1', 'SKU-01'),
    (error) => error?.code === 'CATALOG_SKU_NOT_FOUND',
  );
});
