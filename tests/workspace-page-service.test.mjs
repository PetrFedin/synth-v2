import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkspaceQueryService } from '../src/application/workspace-query-service.mjs';
import { decodeWorkspaceCursor, encodeWorkspaceCursor } from '../src/core/workspace-cursor.mjs';

function emptyWorkspace() {
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
  };
}

test('workspace page service decodes section cursor and returns an immutable continuation', async () => {
  const calls = [];
  const inputCursor = encodeWorkspaceCursor({
    section: 'orders',
    position: ['2026-08-01T10:00:00.000Z', '2026-08-01T09:00:00.000Z', 'order-1'],
  });
  const service = createWorkspaceQueryService({
    reader: {
      async readForActor() { return emptyWorkspace(); },
      async pageForActor(actorId, options) {
        calls.push({ actorId, options });
        return {
          items: [{ id: 'order-2', nested: { value: 1 } }],
          hasMore: true,
          nextPosition: ['2026-07-31T10:00:00.000Z', null, 'order-2'],
        };
      },
    },
  });

  const page = await service.pageForActor('actor-1', { section: 'orders', limit: '25', cursor: inputCursor });
  assert.deepEqual(calls, [{
    actorId: 'actor-1',
    options: {
      section: 'orders',
      limit: 25,
      after: ['2026-08-01T10:00:00.000Z', '2026-08-01T09:00:00.000Z', 'order-1'],
    },
  }]);
  assert.deepEqual(
    decodeWorkspaceCursor(page.nextCursor, { section: 'orders' }).position,
    ['2026-07-31T10:00:00.000Z', null, 'order-2'],
  );
  assert.equal(Object.isFrozen(page), true);
  assert.equal(Object.isFrozen(page.items), true);
  assert.equal(Object.isFrozen(page.items[0].nested), true);
});

test('workspace page service validates section, limit and cursor before reading', async () => {
  let reads = 0;
  const service = createWorkspaceQueryService({
    reader: {
      async readForActor() { return emptyWorkspace(); },
      async pageForActor() { reads += 1; return { items: [], hasMore: false }; },
    },
  });
  for (const request of [
    { section: 'unknown' },
    { section: 'orders', limit: '0' },
    { section: 'orders', limit: '201' },
    { section: 'orders', limit: ' 10 ' },
    { section: 'orders', cursor: encodeWorkspaceCursor({ section: 'catalogSkus', position: ['SKU-1'] }) },
    { section: 'orders', cursor: 'not+base64url' },
  ]) await assert.rejects(() => service.pageForActor('actor-1', request));
  assert.equal(reads, 0);
});

test('workspace page service returns null cursor for a terminal page and rejects invalid reader pages', async () => {
  const terminal = createWorkspaceQueryService({
    reader: {
      async readForActor() { return emptyWorkspace(); },
      async pageForActor() { return { items: [{ sku: 'SKU-1' }], hasMore: false }; },
    },
  });
  assert.deepEqual(
    await terminal.pageForActor('actor-1', { section: 'catalogSkus' }),
    { items: [{ sku: 'SKU-1' }], nextCursor: null },
  );

  const invalid = createWorkspaceQueryService({
    reader: {
      async readForActor() { return emptyWorkspace(); },
      async pageForActor() { return { items: [], hasMore: true, nextPosition: ['SKU-1'] }; },
    },
  });
  await assert.rejects(
    () => invalid.pageForActor('actor-1', { section: 'catalogSkus' }),
    (error) => error.code === 'WORKSPACE_PAGE_RESULT_INVALID',
  );
});
