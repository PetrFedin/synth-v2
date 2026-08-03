import test from 'node:test';
import assert from 'node:assert/strict';
import { createNotificationService } from '../src/application/notification-cursor-service.mjs';
import { decodeNotificationCursor } from '../src/core/notification-cursor.mjs';
import { createPostgresNotificationProjectionStore } from '../src/infrastructure/postgres-notification-cursor-store.mjs';

const sourceStore = Object.freeze({
  async readOutbox() { return []; },
  async snapshot() {
    return {
      memberships: [{ organisationId: 'brand-1', userId: 'user-1', status: 'active' }],
    };
  },
});

test('PostgreSQL notification page exposes the actual database key as nextPosition', async () => {
  const pool = {
    async connect() { throw new Error('page reads must not use a transaction client'); },
    async query() {
      return {
        rows: [
          {
            id: 'notification-db-3',
            created_at: new Date('2026-01-03T00:00:00.000Z'),
            payload: { id: 'notification-db-3', createdAt: '2026-03-01T00:00:00.000Z' },
          },
          {
            id: 'notification-db-2',
            created_at: new Date('2026-01-02T00:00:00.000Z'),
            payload: { id: 'notification-db-2', createdAt: '2026-03-02T00:00:00.000Z' },
          },
          {
            id: 'notification-db-1',
            created_at: new Date('2026-01-01T00:00:00.000Z'),
            payload: { id: 'notification-db-1', createdAt: '2026-03-03T00:00:00.000Z' },
          },
        ],
      };
    },
  };
  const store = createPostgresNotificationProjectionStore({ pool });
  const page = await store.pageForOrganisations(['brand-1'], { limit: 2 });
  assert.deepEqual(page.items, [
    { id: 'notification-db-3', createdAt: '2026-03-01T00:00:00.000Z' },
    { id: 'notification-db-2', createdAt: '2026-03-02T00:00:00.000Z' },
  ]);
  assert.equal(page.hasMore, true);
  assert.deepEqual(page.nextPosition, {
    createdAt: '2026-01-02T00:00:00.000Z',
    id: 'notification-db-2',
  });
});

test('notification service encodes the database nextPosition rather than payload metadata', async () => {
  const projectionStore = {
    async snapshot() { return { notifications: [], projections: [], commands: [] }; },
    async pageForOrganisations(organisationIds, options) {
      assert.deepEqual(organisationIds, ['brand-1']);
      assert.equal(options.limit, 2);
      return {
        items: Object.freeze([
          Object.freeze({ id: 'notification-db-3', createdAt: '2026-03-01T00:00:00.000Z' }),
          Object.freeze({ id: 'notification-db-2', createdAt: '2026-03-02T00:00:00.000Z' }),
        ]),
        hasMore: true,
        nextPosition: Object.freeze({
          createdAt: '2026-01-02T00:00:00.000Z',
          id: 'notification-db-2',
        }),
      };
    },
    transaction() { throw new Error('not used'); },
  };
  const service = createNotificationService({ sourceStore, projectionStore });
  const page = await service.pageForActor('user-1', { limit: 2 });
  assert.deepEqual(decodeNotificationCursor(page.nextCursor), {
    createdAt: '2026-01-02T00:00:00.000Z',
    id: 'notification-db-2',
  });
});

test('PostgreSQL notification continuation binds the exact cursor tuple', async () => {
  const calls = [];
  const pool = {
    async connect() { throw new Error('page reads must not use a transaction client'); },
    async query(text, parameters) {
      calls.push({ text, parameters });
      return { rows: [] };
    },
  };
  const store = createPostgresNotificationProjectionStore({ pool });
  await store.pageForOrganisations(['brand-1'], {
    limit: 25,
    after: {
      createdAt: '2026-01-02T00:00:00.000Z',
      id: 'notification-db-2',
    },
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0].text, /created_at < \$3/);
  assert.match(calls[0].text, /id < \$4/);
  assert.deepEqual(calls[0].parameters, [
    ['brand-1'],
    true,
    '2026-01-02T00:00:00.000Z',
    'notification-db-2',
    26,
  ]);
});
