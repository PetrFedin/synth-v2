import assert from 'node:assert/strict';
import test from 'node:test';
import { createMaterialQueryService } from '../src/application/material-query-service.mjs';

function reader(items = []) {
  return {
    async pageForActor(_actorId, { limit, afterCode, filters }) {
      const filtered = items.filter((item) => (!afterCode || item.code > afterCode)
        && (!filters.status || item.status === filters.status)
        && (!filters.type || item.type === filters.type));
      return { items: filtered.slice(0, limit), hasMore: filtered.length > limit, nextCode: filtered.slice(0, limit).at(-1)?.code };
    },
    async getForActor(_actorId, code) { return items.find((item) => item.code === code); },
  };
}

test('returns bounded immutable pages and filter-bound cursor', async () => {
  const service = createMaterialQueryService({ reader: reader([
    { code: 'FAB-001', type: 'fabric', status: 'draft' },
    { code: 'FAB-002', type: 'fabric', status: 'published' },
  ]) });
  const first = await service.pageForActor('actor-1', { limit: 1, type: 'fabric' });
  assert.equal(first.items.length, 1);
  assert.ok(first.nextCursor);
  const second = await service.pageForActor('actor-1', { limit: 1, type: 'fabric', cursor: first.nextCursor });
  assert.equal(second.items[0].code, 'FAB-002');
  await assert.rejects(() => service.pageForActor('actor-1', { limit: 1, status: 'draft', cursor: first.nextCursor }), { code: 'MATERIAL_CURSOR_INVALID' });
});

test('validates actor, filters and detail identity', async () => {
  const service = createMaterialQueryService({ reader: reader([]) });
  await assert.rejects(() => service.pageForActor('', {}), { code: 'MATERIAL_ACTOR_INVALID' });
  await assert.rejects(() => service.pageForActor('actor-1', { type: 'leather' }), { code: 'MATERIAL_TYPE_FILTER_INVALID' });
  await assert.rejects(() => service.getForActor('actor-1', 'bad code'), { code: 'MATERIAL_CODE_INVALID' });
});
