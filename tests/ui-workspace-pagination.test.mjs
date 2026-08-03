import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function runtime() {
  const source = await readFile(new URL('../public/modules/workspace-pagination.js', import.meta.url), 'utf8');
  const window = {};
  vm.runInNewContext(source, {
    window,
    AbortController,
    Error,
    TypeError,
    Object,
    Array,
    Map,
    Set,
    Promise,
    encodeURIComponent,
  });
  return window.SynthaWorkspacePaging;
}

function workspace(overrides = {}) {
  return {
    orders: [],
    catalogSkus: [],
    pageInfo: {
      limit: 2,
      hasMore: true,
      truncatedSections: ['orders'],
      nextCursors: { orders: 'cursor-1' },
    },
    ...overrides,
  };
}

test('loads and merges one page without duplicate identities', async () => {
  const api = await runtime();
  let state = workspace({ orders: [{ id: 'order-1' }] });
  const calls = [];
  const changes = [];
  const controller = api.create({
    request: async (path, options) => {
      calls.push({ path, options });
      return { items: [{ id: 'order-1', version: 2 }, { id: 'order-2' }], nextCursor: null };
    },
    getWorkspace: () => state,
    setWorkspace: value => { state = value; },
    onChange: value => changes.push(value),
    pageLimit: 2,
  });

  controller.reset(state);
  assert.equal(controller.hasMore('orders'), true);
  assert.equal(await controller.loadNext('orders'), true);
  assert.match(calls[0].path, /limit=2&cursor=cursor-1/);
  assert.equal(calls[0].options.signal instanceof AbortSignal, true);
  assert.equal(
    JSON.stringify(state.orders.map(item => [item.id, item.version ?? 1])),
    JSON.stringify([['order-1', 2], ['order-2', 1]]),
  );
  assert.equal(state.pageInfo.hasMore, false);
  assert.equal(JSON.stringify(state.pageInfo.truncatedSections), '[]');
  assert.equal(controller.status('orders').state, 'complete');
  assert.ok(changes.some(change => change.added === 2));
});

test('deduplicates concurrent load requests', async () => {
  const api = await runtime();
  let resolve;
  let requests = 0;
  let state = workspace();
  const controller = api.create({
    request: () => {
      requests += 1;
      return new Promise(done => { resolve = done; });
    },
    getWorkspace: () => state,
    setWorkspace: value => { state = value; },
  });

  controller.reset(state);
  const first = controller.loadNext('orders');
  const second = controller.loadNext('orders');
  assert.equal(first, second);
  assert.equal(requests, 1);
  resolve({ items: [{ id: 'order-2' }], nextCursor: null });
  await first;
});

test('reset aborts stale pages and prevents stale state writes', async () => {
  const api = await runtime();
  let resolve;
  let state = workspace();
  const controller = api.create({
    request: () => new Promise(done => { resolve = done; }),
    getWorkspace: () => state,
    setWorkspace: value => { state = value; },
  });

  controller.reset(state);
  const pending = controller.loadNext('orders');
  state = workspace({
    orders: [{ id: 'fresh' }],
    pageInfo: { limit: 2, hasMore: false, truncatedSections: [], nextCursors: {} },
  });
  controller.reset(state);
  resolve({ items: [{ id: 'stale' }], nextCursor: null });

  assert.equal(await pending, false);
  assert.equal(JSON.stringify(state.orders.map(item => item.id)), JSON.stringify(['fresh']));
});

test('invalid pages fail without losing continuation', async () => {
  const api = await runtime();
  for (const page of [
    { items: [{ id: 'order-2' }], nextCursor: 'cursor-1' },
    { items: [{}], nextCursor: null },
    { items: [], nextCursor: 'cursor-2' },
  ]) {
    let state = workspace();
    const errors = [];
    const controller = api.create({
      request: async () => page,
      getWorkspace: () => state,
      setWorkspace: value => { state = value; },
      onError: error => errors.push(error),
    });

    controller.reset(state);
    assert.equal(await controller.loadNext('orders'), false);
    assert.equal(controller.hasMore('orders'), true);
    assert.equal(controller.status('orders').state, 'error');
    assert.equal(errors.length, 1);
  }
});
