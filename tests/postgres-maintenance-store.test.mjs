import test from 'node:test';
import assert from 'node:assert/strict';
import { createPostgresMaintenanceStore } from '../src/infrastructure/postgres-maintenance-store.mjs';

const cutoffs = Object.freeze({
  now: '2026-08-02T12:00:00.000Z',
  commandsBefore: '2026-07-03T12:00:00.000Z',
  authAuditBefore: '2026-05-04T12:00:00.000Z',
  throttlesBefore: '2026-07-26T12:00:00.000Z',
  revokedSessionsBefore: '2026-07-26T12:00:00.000Z',
  outboxBefore: '2026-07-03T12:00:00.000Z',
});

function acquiredFixture({ failOn } = {}) {
  const queries = [];
  let released = 0;
  const client = {
    async query(sql, params = []) {
      queries.push({ sql, params });
      if (failOn && sql.includes(failOn)) throw new Error('database failure');
      if (/pg_try_advisory_xact_lock/.test(sql)) return { rows: [{ acquired: true }], rowCount: 1 };
      if (/WITH eligible AS MATERIALIZED/.test(sql)) return { rows: [{ projections: 3, outbox: 3 }], rowCount: 1 };
      if (/WITH terminal AS MATERIALIZED/.test(sql)) return { rows: [{ projections: 2, outbox: 2 }], rowCount: 1 };
      if (/^DELETE FROM commands/.test(sql)) return { rowCount: 2, rows: [] };
      if (/^DELETE FROM catalog_commands/.test(sql)) return { rowCount: 1, rows: [] };
      if (/^DELETE FROM notification_commands/.test(sql)) return { rowCount: 4, rows: [] };
      if (/^DELETE FROM auth_login_audit/.test(sql)) return { rowCount: 5, rows: [] };
      if (/DELETE FROM auth_login_throttles/.test(sql)) return { rowCount: 6, rows: [] };
      if (/DELETE FROM auth_sessions/.test(sql)) return { rowCount: 7, rows: [] };
      if (/DELETE FROM catalog_outbox_events/.test(sql)) return { rowCount: 8, rows: [] };
      return { rowCount: 0, rows: [] };
    },
    release() { released += 1; },
  };
  return {
    queries,
    get released() { return released; },
    pool: { async connect() { return client; } },
  };
}

test('maintenance cleanup is advisory-locked transactional and returns deletion counts', async () => {
  const fixture = acquiredFixture();
  const result = await createPostgresMaintenanceStore({ pool: fixture.pool }).cleanup(cutoffs);
  assert.equal(result.acquired, true);
  assert.deepEqual(result.counts, {
    commands: 2,
    catalogCommands: 1,
    notificationCommands: 4,
    authAudit: 5,
    loginThrottles: 6,
    authSessions: 7,
    notificationProjections: 3,
    outboxEvents: 3,
    deadLetterNotificationProjections: 2,
    deadLetterOutboxEvents: 2,
    catalogOutboxEvents: 8,
  });
  assert.equal(fixture.queries[0].sql, 'BEGIN');
  assert.match(fixture.queries[1].sql, /pg_try_advisory_xact_lock\(hashtextextended\(\$1, 0\)\)/);
  assert.equal(fixture.queries.at(-1).sql, 'COMMIT');
  assert.equal(fixture.released, 1);
  assert.equal(Object.isFrozen(result.counts), true);
});

test('outbox cleanup deletes only eligible published or terminal events and never pending events or user notifications', async () => {
  const fixture = acquiredFixture();
  await createPostgresMaintenanceStore({ pool: fixture.pool }).cleanup(cutoffs);
  const sql = fixture.queries.map((item) => item.sql).join('\n');
  assert.match(sql, /source\.status = 'published'/);
  assert.match(sql, /source\.published_at IS NOT NULL/);
  assert.match(sql, /source\.published_at < \$1/);
  assert.match(sql, /EXISTS[\s\S]*notification_projections/);
  assert.match(sql, /source\.status = 'dead-letter'/);
  assert.match(sql, /JOIN outbox_dead_letters/);
  assert.match(sql, /dead_letter\.failed_at < \$1/);
  assert.match(sql, /DELETE FROM notification_projections/);
  assert.match(sql, /DELETE FROM outbox_events/);
  assert.doesNotMatch(sql, /DELETE FROM notifications(?:\s|$)/);
  assert.doesNotMatch(sql, /status = 'pending'/);
  const publishedQuery = fixture.queries.find((item) => /WITH eligible AS MATERIALIZED/.test(item.sql));
  const terminalQuery = fixture.queries.find((item) => /WITH terminal AS MATERIALIZED/.test(item.sql));
  assert.deepEqual(publishedQuery.params, [cutoffs.outboxBefore]);
  assert.deepEqual(terminalQuery.params, [cutoffs.outboxBefore]);
});

test('lock contention commits without executing retention deletes', async () => {
  const queries = [];
  let released = 0;
  const client = {
    async query(sql, params = []) {
      queries.push({ sql, params });
      if (/pg_try_advisory_xact_lock/.test(sql)) return { rows: [{ acquired: false }] };
      return { rows: [], rowCount: 0 };
    },
    release() { released += 1; },
  };
  const result = await createPostgresMaintenanceStore({ pool: { async connect() { return client; } } }).cleanup(cutoffs);
  assert.deepEqual(result, { acquired: false, counts: {} });
  assert.deepEqual(queries.map((item) => item.sql), [
    'BEGIN',
    'SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS acquired',
    'COMMIT',
  ]);
  assert.equal(released, 1);
});

test('cleanup rolls back and releases the connection after a deletion failure', async () => {
  const fixture = acquiredFixture({ failOn: 'DELETE FROM catalog_commands' });
  await assert.rejects(
    () => createPostgresMaintenanceStore({ pool: fixture.pool }).cleanup(cutoffs),
    /database failure/,
  );
  assert.equal(fixture.queries.at(-1).sql, 'ROLLBACK');
  assert.equal(fixture.released, 1);
  assert.equal(fixture.queries.some((item) => item.sql === 'COMMIT'), false);
});

test('cleanup validates every cutoff before checking out a database connection', async () => {
  let connects = 0;
  const store = createPostgresMaintenanceStore({ pool: { async connect() { connects += 1; } } });
  await assert.rejects(
    () => store.cleanup({ ...cutoffs, commandsBefore: 'invalid' }),
    (error) => error.code === 'MAINTENANCE_CUTOFF_INVALID' && error.details.field === 'commandsBefore',
  );
  assert.equal(connects, 0);
});
