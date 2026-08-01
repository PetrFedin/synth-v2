import test from 'node:test';
import assert from 'node:assert/strict';
import { createNotificationService } from '../src/application/notification-service.mjs';
import { createPostgresNotificationProjectionStore } from '../src/infrastructure/postgres-notification-projection-store.mjs';

const sourceStore = Object.freeze({
  readOutbox: async () => [],
  snapshot: async () => { throw new Error('source snapshot must not run'); },
});

function replayStore({ membership }) {
  const calls = [];
  const previousResult = Object.freeze({
    id: 'notification-1',
    recipientOrganisationId: 'brand-1',
    status: 'read',
    version: 2,
    body: 'protected notification body',
  });
  return {
    calls,
    previousResult,
    snapshot: async () => ({ notifications: [], projections: [], commands: [] }),
    async transaction(work) {
      return work({
        async getCommand(id) {
          calls.push(`command:${id}`);
          return Object.freeze({
            id,
            fingerprint: 'markNotificationRead:user-1:notification-1',
            actorId: 'user-1',
            result: previousResult,
          });
        },
        async getNotification(id) {
          calls.push(`notification:${id}`);
          return Object.freeze({
            id,
            recipientOrganisationId: 'brand-1',
            status: 'read',
            version: 2,
          });
        },
        async getActiveMembership(organisationId, actorId) {
          calls.push(`membership:${organisationId}:${actorId}`);
          return membership;
        },
        saveNotification() { throw new Error('replay must not save'); },
        insertCommand() { throw new Error('replay must not insert a command'); },
      });
    },
  };
}

test('revoked actors cannot retrieve a stored notification result by replaying commandId', async () => {
  const projectionStore = replayStore({ membership: undefined });
  const service = createNotificationService({ sourceStore, projectionStore });

  await assert.rejects(
    () => service.markRead('command-1', 'user-1', 'notification-1'),
    (error) => error.code === 'ACTIVE_MEMBERSHIP_REQUIRED',
  );
  assert.deepEqual(projectionStore.calls, [
    'command:command-1',
    'notification:notification-1',
    'membership:brand-1:user-1',
  ]);
});

test('authorized command replay returns the previous result only after current authorization', async () => {
  const projectionStore = replayStore({
    membership: Object.freeze({
      organisationId: 'brand-1',
      userId: 'user-1',
      status: 'active',
      role: 'owner',
    }),
  });
  const service = createNotificationService({ sourceStore, projectionStore });

  const result = await service.markRead('command-1', 'user-1', 'notification-1');

  assert.equal(result, projectionStore.previousResult);
  assert.deepEqual(projectionStore.calls, [
    'command:command-1',
    'notification:notification-1',
    'membership:brand-1:user-1',
  ]);
});

test('PostgreSQL mark-read locks the notification and membership through commit', async () => {
  const queries = [];
  const client = {
    async query(sql, params = []) {
      queries.push({ sql, params });
      if (/FROM notification_commands/.test(sql)) return { rows: [] };
      if (/FROM notifications WHERE id/.test(sql)) {
        return {
          rows: [{
            payload: {
              id: 'notification-1',
              recipientOrganisationId: 'brand-1',
              status: 'unread',
              version: 1,
            },
          }],
        };
      }
      if (/FROM memberships/.test(sql)) {
        return {
          rows: [{
            payload: {
              organisationId: 'brand-1',
              userId: 'user-1',
              status: 'active',
              role: 'owner',
            },
          }],
        };
      }
      if (/UPDATE notifications/.test(sql)) return { rows: [], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    },
    release() { queries.push({ sql: 'RELEASE', params: [] }); },
  };
  const projectionStore = createPostgresNotificationProjectionStore({
    pool: {
      async connect() { return client; },
      async query() { throw new Error('pool.query must not run inside mark-read'); },
    },
  });
  const service = createNotificationService({
    sourceStore,
    projectionStore,
    clock: () => '2026-08-02T00:00:00.000Z',
  });

  const result = await service.markRead('command-1', 'user-1', 'notification-1');

  assert.equal(result.status, 'read');
  const notificationRead = queries.find((item) => /FROM notifications WHERE id/.test(item.sql));
  const membershipRead = queries.find((item) => /FROM memberships/.test(item.sql));
  assert.match(notificationRead.sql, /FOR UPDATE$/);
  assert.match(membershipRead.sql, /FOR SHARE$/);
  assert.equal(queries.at(-2).sql, 'COMMIT');
  assert.equal(queries.at(-1).sql, 'RELEASE');
});
