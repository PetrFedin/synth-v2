import test from 'node:test';
import assert from 'node:assert/strict';
import { createNotificationService } from '../src/application/notification-service.mjs';
import { decodeNotificationCursor } from '../src/core/notification-cursor.mjs';
import { createPostgresNotificationProjectionStore } from '../src/infrastructure/postgres-notification-projection-store.mjs';

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
            id: 'notification-2',
            created_at: new Date('2026-08-02T12:00:00.000Z'),
            payload: {
              id: 'notification-2',
              createdAt: '1999-01-01T00:00:00.000Z',
              recipientOrganisationId: 'brand-1',
            },
          },
          {
            id: 'notification-1',
            created_at: new Date('2026-08-02T11:00:00.000Z'),
            payload: {
              id: 'notification-1',
              createdAt: '1998-01-01T00:00:00.000Z',
              recipientOrganisationId: 'brand-1',
            },
          },
          {
            id: 'notification-0',
            created_at: new Date('2026-08-02T10:00:00.000Z'),
            payload: {
              id: 'notification-0',
              createdAt: '1997-01-01T00:00:00.000Z',
              recipientOrganisationId: 'brand-1',
            },
          },
        ],
      };
    },
  };
  const store = createPostgresNotificationProjectionStore({ pool });

  const page = await store.pageForOrganisations(['brand-1'], { limit: 2 });

  assert.equal(page.hasMore, true);
  assert.deepEqual(page.nextPosition, {
    createdAt: '2026-08-02T11:00:00.000Z',
    id: 'notification-1',
  });
  assert.notEqual(page.nextPosition.createdAt, page.items.at(-1).createdAt);
  assert.equal(Object.isFrozen(page.nextPosition), true);
});

test('notification service encodes the database nextPosition instead of payload metadata', async () => {
  const projectionStore = {
    async transaction() { throw new Error('transaction is not expected'); },
    async snapshot() { return { notifications: [], projections: [], commands: [] }; },
    async pageForOrganisations() {
      return Object.freeze({
        items: Object.freeze([Object.freeze({
          id: 'notification-1',
          createdAt: '1998-01-01T00:00:00.000Z',
          recipientOrganisationId: 'brand-1',
        })]),
        hasMore: true,
        nextPosition: Object.freeze({
          createdAt: '2026-08-02T11:00:00.000Z',
          id: 'notification-1',
        }),
      });
    },
  };
  const service = createNotificationService({ sourceStore, projectionStore });

  const page = await service.pageForActor('user-1', { limit: 1 });

  assert.deepEqual(decodeNotificationCursor(page.nextCursor), {
    createdAt: '2026-08-02T11:00:00.000Z',
    id: 'notification-1',
  });
});
