import test from 'node:test';
import assert from 'node:assert/strict';
import { createNotificationService } from '../src/application/notification-service.mjs';
import { createPostgresNotificationReader } from '../src/infrastructure/postgres-notification-reader.mjs';

function projectionStore() {
  const notifications = [{
    id: 'notification-1',
    recipientOrganisationId: 'brand-1',
    status: 'unread',
    version: 1,
  }];
  const projections = new Set();
  const failures = [];
  return {
    failures,
    listCalls: [],
    async readUnprojectedOutbox() {
      return [{ event: { id: 'event-1', type: 'selection.submitted', aggregateId: 'missing-selection', payload: {} } }];
    },
    async listForOrganisations(ids) {
      this.listCalls.push(ids);
      return notifications.filter((item) => ids.includes(item.recipientOrganisationId));
    },
    async recordProjectionFailure(input) {
      failures.push(input);
      projections.add(input.event.id);
      return true;
    },
    snapshot() { return { notifications, projections: [], commands: [] }; },
    async transaction(work) {
      return work({
        hasProjection: (id) => projections.has(id),
        getNotificationByDedupeKey: () => undefined,
        insertNotification() {},
        insertProjection: (projection) => projections.add(projection.eventId),
        getCommand: () => undefined,
        getNotification: (id) => notifications.find((item) => item.id === id),
        saveNotification(updated) {
          const index = notifications.findIndex((item) => item.id === updated.id);
          notifications[index] = updated;
        },
        insertCommand() {},
      });
    },
  };
}

test('scoped reader removes full source snapshots from projection and list paths', async () => {
  let sourceSnapshots = 0;
  const sourceStore = {
    readOutbox: async () => [],
    snapshot: async () => { sourceSnapshots += 1; throw new Error('full source snapshot must not run'); },
  };
  const projection = projectionStore();
  const reader = {
    async loadProjectionContext() { return { selections: [], orders: [], deals: [] }; },
    async listActiveMembershipsForActor() {
      return [{ organisationId: 'brand-1', userId: 'user-1', status: 'active' }];
    },
    async getActiveMembership() {
      return { organisationId: 'brand-1', userId: 'user-1', status: 'active', role: 'owner' };
    },
  };
  const service = createNotificationService({
    sourceStore,
    projectionStore: projection,
    reader,
    clock: () => '2026-08-02T00:00:00.000Z',
  });

  const projected = await service.projectPending({ limit: 10 });
  assert.equal(projected[0].checkpointed, true);
  assert.equal(projected[0].retryable, false);
  assert.equal(projection.failures[0].errorCode, 'SELECTION_NOT_FOUND');

  const listed = await service.listForActor('user-1');
  assert.equal(listed.length, 1);
  assert.deepEqual(projection.listCalls, [['brand-1']]);

  await service.markRead('command-1', 'user-1', 'notification-1');
  assert.equal(sourceSnapshots, 0);
});

test('PostgreSQL reader loads only aggregate types required by a projection batch', async () => {
  const calls = [];
  const pool = {
    async query(sql, params) {
      calls.push({ sql, params });
      return { rows: [] };
    },
  };
  const reader = createPostgresNotificationReader({ pool });
  await reader.loadProjectionContext([
    { type: 'selection.submitted', aggregateId: 'selection-1' },
    { type: 'selection.submitted', aggregateId: 'selection-1' },
    { type: 'deal-space.opened', aggregateId: 'deal-1' },
    { type: 'campaign.created', aggregateId: 'campaign-1' },
  ]);
  assert.equal(calls.length, 2);
  assert.match(calls[0].sql, /FROM selections/);
  assert.deepEqual(calls[0].params, [['selection-1']]);
  assert.match(calls[1].sql, /FROM deals/);
  assert.deepEqual(calls[1].params, [['deal-1']]);
});

test('PostgreSQL membership reads are actor and organisation scoped', async () => {
  const calls = [];
  const pool = {
    async query(sql, params) {
      calls.push({ sql, params });
      return { rows: [] };
    },
  };
  const reader = createPostgresNotificationReader({ pool });
  await reader.listActiveMembershipsForActor('user-1');
  await reader.getActiveMembership('brand-1', 'user-1');
  assert.match(calls[0].sql, /user_id = \$1 AND status = \$2/);
  assert.deepEqual(calls[0].params, ['user-1', 'active']);
  assert.match(calls[1].sql, /organisation_id = \$1[\s\S]*user_id = \$2[\s\S]*status = 'active'/);
  assert.deepEqual(calls[1].params, ['brand-1', 'user-1']);
});
