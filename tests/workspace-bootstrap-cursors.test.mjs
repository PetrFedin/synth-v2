import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkspaceQueryService } from '../src/application/workspace-query-service.mjs';
import { decodeWorkspaceCursor } from '../src/core/workspace-cursor.mjs';

function emptyWorkspace(overrides = {}) {
  return {
    memberships: [],
    organisations: [],
    relationships: [],
    invitations: [],
    campaigns: [],
    collections: [],
    catalogSkus: [],
    showrooms: [],
    cycles: [],
    selections: [],
    orders: [],
    deals: [],
    calendar: [],
    ...overrides,
  };
}

test('bootstrap returns a continuation cursor for every truncated section', async () => {
  const service = createWorkspaceQueryService({
    reader: {
      async readForActor() {
        return emptyWorkspace({
          orders: [
            { id: 'order-2', updatedAt: '2026-08-03T10:00:00.000Z', createdAt: '2026-08-01T10:00:00.000Z' },
            { id: 'order-1', updatedAt: '2026-08-02T10:00:00.000Z', createdAt: '2026-08-01T09:00:00.000Z' },
          ],
          catalogSkus: [{ sku: 'SKU-1' }],
          pageInfo: { truncatedSections: ['orders', 'catalogSkus'] },
        });
      },
    },
  });

  const workspace = await service.loadForActor('actor-1', { limit: 2 });
  assert.deepEqual(workspace.pageInfo.truncatedSections, ['catalogSkus', 'orders']);
  assert.equal(workspace.pageInfo.hasMore, true);
  assert.deepEqual(
    decodeWorkspaceCursor(workspace.pageInfo.nextCursors.orders, { section: 'orders' }).position,
    ['2026-08-02T10:00:00.000Z', '2026-08-01T09:00:00.000Z', 'order-1'],
  );
  assert.deepEqual(
    decodeWorkspaceCursor(workspace.pageInfo.nextCursors.catalogSkus, { section: 'catalogSkus' }).position,
    ['SKU-1'],
  );
  assert.equal(Object.isFrozen(workspace.pageInfo.nextCursors), true);
});

test('truncated section without a returned continuation item is rejected', async () => {
  const service = createWorkspaceQueryService({
    reader: {
      async readForActor() {
        return emptyWorkspace({ pageInfo: { truncatedSections: ['orders'] } });
      },
    },
  });

  await assert.rejects(
    () => service.loadForActor('actor-1'),
    error => error.code === 'WORKSPACE_PAGE_RESULT_INVALID' && error.details.section === 'orders',
  );
});
