import test from 'node:test';
import assert from 'node:assert/strict';
import { createNotificationService } from '../src/application/notification-service.mjs';
import { createPostgresNotificationProjectionStore } from '../src/infrastructure/postgres-notification-projection-store.mjs';
import { wholesaleV2OpenApi } from '../src/http/openapi.mjs';

function sourceStore() {
  return {
    readOutbox: async () => [],
    snapshot: async () => ({
      memberships: [{ organisationId: 'brand-1', userId: 'user-1', status: 'active' }],
    }),
  };
}

function projectionStoreWithList() {
  const calls = [];
  return {
    calls,
    transaction: async (work) => work({}),
    snapshot: async () => ({ notifications: [], projections: [], commands: [] }),
    async listForOrganisations(ids, options) {
      calls.push([ids, options]);
      return [];
    },
  };
}

test('notification service applies default and explicit list limits', async () => {
  const projection = projectionStoreWithList();
  const service = createNotificationService({ sourceStore: sourceStore(), projectionStore: projection });
  await service.listForActor('user-1');
  await service.listForActor('user-1', { limit: '25' });
  assert.deepEqual(projection.calls, [
    [['brand-1'], { limit: 100 }],
    [['brand-1'], { limit: 25 }],
  ]);
});

test('notification service rejects invalid list limits before database reads', async () => {
  const projection = projectionStoreWithList();
  const service = createNotificationService({ sourceStore: sourceStore(), projectionStore: projection });
  for (const limit of [0, 501, '1.5', 'abc', -1]) {
    await assert.rejects(
      () => service.listForActor('user-1', { limit }),
      (error) => error.code === 'NOTIFICATION_LIMIT_INVALID',
      String(limit),
    );
  }
  assert.equal(projection.calls.length, 0);
});

test('fallback notification reads sort unread first and slice to the requested limit', async () => {
  const projection = {
    transaction: async (work) => work({}),
    snapshot: async () => ({
      projections: [], commands: [],
      notifications: [
        { id: 'n1', recipientOrganisationId: 'brand-1', status: 'read', createdAt: '2026-08-03T00:00:00Z' },
        { id: 'n2', recipientOrganisationId: 'brand-1', status: 'unread', createdAt: '2026-08-01T00:00:00Z' },
        { id: 'n3', recipientOrganisationId: 'brand-1', status: 'unread', createdAt: '2026-08-02T00:00:00Z' },
        { id: 'foreign', recipientOrganisationId: 'shop-2', status: 'unread', createdAt: '2026-08-04T00:00:00Z' },
      ],
    }),
  };
  const service = createNotificationService({ sourceStore: sourceStore(), projectionStore: projection });
  const result = await service.listForActor('user-1', { limit: 2 });
  assert.deepEqual(result.map((item) => item.id), ['n3', 'n2']);
  assert.equal(Object.isFrozen(result), true);
});

test('PostgreSQL list query uses a server-side limit', async () => {
  let captured;
  const pool = {
    async query(sql, params) {
      captured = { sql, params };
      return { rows: [] };
    },
    async connect() { throw new Error('transaction not expected'); },
  };
  const store = createPostgresNotificationProjectionStore({ pool });
  await store.listForOrganisations(['brand-1', 'brand-1', 'shop-1'], { limit: 25 });
  assert.match(captured.sql, /LIMIT \$2/);
  assert.deepEqual(captured.params, [['brand-1', 'shop-1'], 25]);
  await assert.rejects(
    () => store.listForOrganisations(['brand-1'], { limit: 501 }),
    (error) => error.code === 'NOTIFICATION_LIMIT_INVALID',
  );
});

test('OpenAPI documents the notification limit contract', () => {
  const parameters = wholesaleV2OpenApi.paths['/notifications'].get.parameters;
  const limit = parameters.find((item) => item.name === 'limit');
  assert.deepEqual(limit.schema, { type: 'integer', minimum: 1, maximum: 500, default: 100 });
  assert.equal(limit.in, 'query');
  assert.equal(limit.required, false);
});
