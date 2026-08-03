import test from 'node:test';
import assert from 'node:assert/strict';
import { createNotificationService } from '../src/application/notification-service.mjs';
import { decodeNotificationCursor, encodeNotificationCursor } from '../src/core/notification-cursor.mjs';
import { createPostgresNotificationProjectionStore } from '../src/infrastructure/postgres-notification-projection-store.mjs';
import { wholesaleV2OpenApi } from '../src/http/openapi.mjs';
import { createWholesaleRoutes, matchWholesaleRoute } from '../src/http/routes.mjs';

function notification(id, createdAt, status = 'unread') {
  return Object.freeze({
    id,
    createdAt,
    status,
    recipientOrganisationId: 'brand-1',
    type: 'selection-submitted',
  });
}

const sourceStore = Object.freeze({
  async readOutbox() { return []; },
  async snapshot() {
    return {
      memberships: [{ organisationId: 'brand-1', userId: 'user-1', status: 'active' }],
    };
  },
});

test('notification cursor is versioned, canonical and round-trips its keyset position', () => {
  const cursor = encodeNotificationCursor({
    createdAt: '2026-08-02T12:00:00Z',
    id: 'notification-2',
  });
  assert.match(cursor, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodeNotificationCursor(cursor), {
    createdAt: '2026-08-02T12:00:00.000Z',
    id: 'notification-2',
  });
  assert.equal(encodeNotificationCursor(decodeNotificationCursor(cursor)), cursor);
});

test('notification cursor rejects malformed, unsupported and oversized payloads', () => {
  for (const cursor of [
    '***',
    Buffer.from(JSON.stringify([2, '2026-08-02T12:00:00.000Z', 'notification-2'])).toString('base64url'),
    Buffer.from(JSON.stringify([1, 'not-a-date', 'notification-2'])).toString('base64url'),
    'a'.repeat(1025),
  ]) {
    assert.throws(
      () => decodeNotificationCursor(cursor),
      (error) => error.code === 'NOTIFICATION_CURSOR_INVALID',
    );
  }
});

test('snapshot pagination is stable across status changes and newly inserted leading rows', async () => {
  let notifications = [
    notification('notification-2', '2026-08-02T12:00:00.000Z', 'read'),
    notification('notification-1', '2026-08-02T12:00:00.000Z', 'unread'),
    notification('notification-9', '2026-08-02T11:00:00.000Z', 'unread'),
    notification('notification-3', '2026-08-02T10:00:00.000Z', 'read'),
  ];
  const projectionStore = {
    async snapshot() { return { notifications, projections: [], commands: [] }; },
    async transaction() { throw new Error('transaction is not expected'); },
  };
  const service = createNotificationService({ sourceStore, projectionStore });

  const first = await service.pageForActor('user-1', { limit: 2 });
  assert.deepEqual(first.items.map((item) => item.id), ['notification-2', 'notification-1']);
  assert.equal(typeof first.nextCursor, 'string');
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.items), true);

  notifications = [
    notification('notification-new', '2026-08-02T13:00:00.000Z', 'unread'),
    notification('notification-2', '2026-08-02T12:00:00.000Z', 'unread'),
    notification('notification-1', '2026-08-02T12:00:00.000Z', 'read'),
    notification('notification-9', '2026-08-02T11:00:00.000Z', 'read'),
    notification('notification-3', '2026-08-02T10:00:00.000Z', 'unread'),
  ];
  const second = await service.pageForActor('user-1', { limit: 2, cursor: first.nextCursor });
  assert.deepEqual(second.items.map((item) => item.id), ['notification-9', 'notification-3']);
  assert.equal(second.nextCursor, null);
  assert.deepEqual(
    [...first.items, ...second.items].map((item) => item.id),
    ['notification-2', 'notification-1', 'notification-9', 'notification-3'],
  );
});

test('notification page validates the limit and cursor before reading projections', async () => {
  let projectionReads = 0;
  const service = createNotificationService({
    sourceStore,
    projectionStore: {
      async snapshot() { projectionReads += 1; return { notifications: [], projections: [], commands: [] }; },
      async transaction() { throw new Error('transaction is not expected'); },
    },
  });

  await assert.rejects(
    () => service.pageForActor('user-1', { limit: 201 }),
    (error) => error.code === 'NOTIFICATION_PAGE_LIMIT_INVALID',
  );
  await assert.rejects(
    () => service.pageForActor('user-1', { cursor: 'not-base64!' }),
    (error) => error.code === 'NOTIFICATION_CURSOR_INVALID',
  );
  assert.equal(projectionReads, 0);
});

test('PostgreSQL notification pages use indexed keyset predicates and limit plus one', async () => {
  const queries = [];
  const pool = {
    async connect() { throw new Error('page reads must not check out a transaction client'); },
    async query(sql, params = []) {
      queries.push({ sql, params });
      return {
        rows: [
          { payload: notification('notification-2', '2026-08-02T12:00:00.000Z'), created_at: new Date('2026-08-02T12:00:00.000Z'), id: 'notification-2' },
          { payload: notification('notification-1', '2026-08-02T11:00:00.000Z'), created_at: new Date('2026-08-02T11:00:00.000Z'), id: 'notification-1' },
          { payload: notification('notification-0', '2026-08-02T10:00:00.000Z'), created_at: new Date('2026-08-02T10:00:00.000Z'), id: 'notification-0' },
        ],
      };
    },
  };
  const store = createPostgresNotificationProjectionStore({ pool });

  const first = await store.pageForOrganisations(['brand-1', 'brand-1'], { limit: 2 });
  assert.deepEqual(first.items.map((item) => item.id), ['notification-2', 'notification-1']);
  assert.equal(first.hasMore, true);
  assert.match(queries[0].sql, /ORDER BY created_at DESC, id DESC/);
  assert.match(queries[0].sql, /LIMIT \$2/);
  assert.doesNotMatch(queries[0].sql, /OFFSET/i);
  assert.deepEqual(queries[0].params, [['brand-1'], 3]);

  await store.pageForOrganisations(['brand-1'], {
    limit: 2,
    after: { createdAt: '2026-08-02T11:00:00.000Z', id: 'notification-1' },
  });
  assert.match(queries[1].sql, /\(created_at, id\) < \(\$2::timestamptz, \$3::text\)/);
  assert.match(queries[1].sql, /LIMIT \$4/);
  assert.doesNotMatch(queries[1].sql, /OFFSET/i);
  assert.deepEqual(queries[1].params, [
    ['brand-1'],
    '2026-08-02T11:00:00.000Z',
    'notification-1',
    3,
  ]);
});

test('PostgreSQL notification insert persists the immutable pagination timestamp', async () => {
  const queries = [];
  const client = {
    async query(sql, params = []) {
      queries.push({ sql, params });
      return { rows: [], rowCount: 1 };
    },
    release() { queries.push({ sql: 'RELEASE', params: [] }); },
  };
  const store = createPostgresNotificationProjectionStore({
    pool: {
      async connect() { return client; },
      async query() { throw new Error('pool.query is not expected'); },
    },
  });
  const value = {
    ...notification('notification-1', '2026-08-02T12:00:00.000Z'),
    dedupeKey: 'event-1:brand-1',
    sourceEventId: 'event-1',
    version: 1,
  };

  await store.transaction((tx) => tx.insertNotification(value));
  const insert = queries.find((item) => /INSERT INTO notifications/.test(item.sql));
  assert.match(insert.sql, /version, created_at, payload/);
  assert.equal(insert.params[7], value.createdAt);
  assert.equal(queries.at(-2).sql, 'COMMIT');
  assert.equal(queries.at(-1).sql, 'RELEASE');
});

test('notification page route and OpenAPI expose only limit and cursor query parameters', async () => {
  const calls = [];
  const routes = createWholesaleRoutes({
    platform: {},
    catalog: {},
    partners: {},
    collaboration: {},
    orders: {},
    workspace: {},
    notifications: {
      async pageForActor(actorId, options) { calls.push({ actorId, options }); return { items: [], nextCursor: null }; },
    },
  });
  const match = matchWholesaleRoute(routes, 'GET', '/v2/notifications/page');
  assert.ok(match);
  await match.execute({
    actorId: 'user-1',
    query: { limit: '25', cursor: 'abc' },
    body: {},
    params: match.params,
  });
  assert.deepEqual(calls, [{ actorId: 'user-1', options: { limit: '25', cursor: 'abc' } }]);
  await assert.rejects(
    () => match.execute({ actorId: 'user-1', query: { debug: '1' }, body: {}, params: match.params }),
    (error) => error.code === 'HTTP_QUERY_FIELD_UNKNOWN',
  );

  const operation = wholesaleV2OpenApi.paths['/notifications/page'].get;
  assert.equal(operation.operationId, 'pageNotifications');
  assert.deepEqual(operation.parameters.map((parameter) => parameter.name), ['limit', 'cursor']);
  assert.equal(operation.parameters[0].schema.maximum, 200);
  assert.equal(operation.parameters[1].schema.maxLength, 1024);
});
