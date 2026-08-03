import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function runtime() {
  const source = await readFile(new URL('../public/modules/notification-pagination.js', import.meta.url), 'utf8');
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
    Number,
    Math,
    encodeURIComponent,
  });
  return window.SynthaNotificationPaging;
}

function firstPage(overrides = {}) {
  return {
    items: [{ id: 'notification-1', status: 'unread' }],
    nextCursor: 'cursor-1',
    unreadCount: 3,
    ...overrides,
  };
}

test('loads and merges notification pages while preserving exact unread count', async () => {
  const api = await runtime();
  let notifications = [];
  let unreadCount = 0;
  const calls = [];
  const controller = api.create({
    request: async (path, options) => {
      calls.push({ path, options });
      return {
        items: [
          { id: 'notification-1', status: 'read' },
          { id: 'notification-2', status: 'unread' },
        ],
        nextCursor: null,
        unreadCount: 2,
      };
    },
    getNotifications: () => notifications,
    setNotifications: value => { notifications = value; },
    getUnreadCount: () => unreadCount,
    setUnreadCount: value => { unreadCount = value; },
    pageLimit: 2,
  });

  controller.reset(firstPage());
  assert.equal(controller.hasMore(), true);
  assert.equal(await controller.loadNext(), true);
  assert.match(calls[0].path, /limit=2&cursor=cursor-1/);
  assert.equal(calls[0].options.signal instanceof AbortSignal, true);
  assert.equal(JSON.stringify(notifications.map(item => [item.id, item.status])), JSON.stringify([
    ['notification-1', 'read'],
    ['notification-2', 'unread'],
  ]));
  assert.equal(unreadCount, 2);
  assert.equal(controller.hasMore(), false);
});

test('deduplicates concurrent loads and ignores a stale generation', async () => {
  const api = await runtime();
  let notifications = [];
  let unreadCount = 0;
  let resolve;
  let requests = 0;
  const controller = api.create({
    request: () => {
      requests += 1;
      return new Promise(done => { resolve = done; });
    },
    getNotifications: () => notifications,
    setNotifications: value => { notifications = value; },
    getUnreadCount: () => unreadCount,
    setUnreadCount: value => { unreadCount = value; },
  });

  controller.reset(firstPage());
  const first = controller.loadNext();
  const second = controller.loadNext();
  assert.equal(first, second);
  assert.equal(requests, 1);
  controller.reset({ items: [{ id: 'fresh', status: 'read' }], nextCursor: null, unreadCount: 0 });
  resolve({ items: [{ id: 'stale', status: 'unread' }], nextCursor: null, unreadCount: 1 });
  assert.equal(await first, false);
  assert.equal(JSON.stringify(notifications.map(item => item.id)), JSON.stringify(['fresh']));
});

test('applies mark-read results locally and adjusts exact unread count once', async () => {
  const api = await runtime();
  let notifications = [];
  let unreadCount = 0;
  const controller = api.create({
    request: async () => { throw new Error('not expected'); },
    getNotifications: () => notifications,
    setNotifications: value => { notifications = value; },
    getUnreadCount: () => unreadCount,
    setUnreadCount: value => { unreadCount = value; },
  });

  controller.reset(firstPage({ nextCursor: null }));
  controller.applyUpdated({ id: 'notification-1', status: 'read', version: 2 });
  assert.equal(unreadCount, 2);
  controller.applyUpdated({ id: 'notification-1', status: 'read', version: 2 });
  assert.equal(unreadCount, 2);
  assert.equal(notifications[0].version, 2);
});

test('rejects malformed count, cursor loops and empty continuation pages', async () => {
  const api = await runtime();
  assert.throws(() => {
    const controller = api.create({
      request: async () => ({}),
      getNotifications: () => [],
      setNotifications: () => {},
      getUnreadCount: () => 0,
      setUnreadCount: () => {},
    });
    controller.reset({ items: [], nextCursor: null, unreadCount: -1 });
  }, error => error.code === 'NOTIFICATION_COUNT_INVALID');

  for (const page of [
    { items: [{ id: 'notification-2' }], nextCursor: 'cursor-1', unreadCount: 3 },
    { items: [], nextCursor: 'cursor-2', unreadCount: 3 },
  ]) {
    let notifications = [];
    let unreadCount = 0;
    const controller = api.create({
      request: async () => page,
      getNotifications: () => notifications,
      setNotifications: value => { notifications = value; },
      getUnreadCount: () => unreadCount,
      setUnreadCount: value => { unreadCount = value; },
    });
    controller.reset(firstPage());
    assert.equal(await controller.loadNext(), false);
    assert.equal(controller.hasMore(), true);
    assert.equal(controller.status().state, 'error');
  }
});
