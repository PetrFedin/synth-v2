import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function source(file) {
  return readFile(path.join(root, file), 'utf8');
}

test('PostgreSQL runtime creates and exposes maintenance and optional outbox publication services', async () => {
  const runtime = await source('src/runtime/postgres-runtime.mjs');
  assert.match(runtime, /createMaintenanceService/);
  assert.match(runtime, /createPostgresMaintenanceStore/);
  assert.match(runtime, /const maintenance = createMaintenanceService\(\{/);
  assert.match(runtime, /createOutboxPublisherService/);
  assert.match(runtime, /createPostgresOutboxPublicationStore/);
  assert.match(runtime, /const outboxPublication = outboxPublisher \? createOutboxPublisherService\(\{/);
  assert.match(runtime, /return Object\.freeze\(\{\s*auth, readiness, maintenance, outboxPublication,/);
  assert.match(runtime, /commandRetentionMs/);
  assert.match(runtime, /outboxRetentionMs/);
});

test('production workers run maintenance and external outbox publication independently', async () => {
  const server = await source('src/server.mjs');
  assert.equal((server.match(/createBackgroundWorker\(/g) ?? []).length, 2);
  assert.match(server, /name: 'notification-projection'/);
  assert.match(server, /name: 'outbox-publication'/);
  assert.match(server, /runtime\.maintenance\.runIfDue\(\)/);
  assert.match(server, /runtime\.outboxPublication\.publishPending\(\{/);
  assert.match(server, /healthRegistry\.register\('outbox-publication'/);
  assert.match(server, /outboxWorker\?\.start\(\)/);
  assert.match(server, /Syntha V2 maintenance removed/);
  assert.match(server, /SYNTHA_MAINTENANCE_INTERVAL_MS/);
  assert.match(server, /SYNTHA_COMMAND_RETENTION_MS/);
  assert.match(server, /SYNTHA_AUTH_AUDIT_RETENTION_MS/);
  assert.match(server, /SYNTHA_AUTH_THROTTLE_RETENTION_MS/);
  assert.match(server, /SYNTHA_OUTBOX_RETENTION_MS/);
  assert.ok(server.indexOf('runtime.maintenance.runIfDue()') < server.indexOf('NOTIFICATION_PROJECTION_RETRYABLE_FAILURE'));
});

test('environment example documents retention and optional external delivery controls', async () => {
  const env = await source('.env.example');
  for (const key of [
    'SYNTHA_MAINTENANCE_INTERVAL_MS',
    'SYNTHA_MAINTENANCE_RETRY_DELAY_MS',
    'SYNTHA_COMMAND_RETENTION_MS',
    'SYNTHA_AUTH_AUDIT_RETENTION_MS',
    'SYNTHA_AUTH_THROTTLE_RETENTION_MS',
    'SYNTHA_REVOKED_SESSION_RETENTION_MS',
    'SYNTHA_OUTBOX_RETENTION_MS',
    'SYNTHA_OUTBOX_WEBHOOK_URL',
    'SYNTHA_OUTBOX_WEBHOOK_SECRET',
    'SYNTHA_OUTBOX_PUBLICATION_INTERVAL_MS',
    'SYNTHA_OUTBOX_PUBLICATION_BATCH_SIZE',
    'SYNTHA_OUTBOX_PUBLICATION_LEASE_MS',
    'SYNTHA_OUTBOX_PUBLICATION_MAX_ATTEMPTS',
  ]) assert.match(env, new RegExp(`^${key}=`, 'm'), key);
  assert.match(env, /^SYNTHA_COMMAND_RETENTION_MS=2592000000$/m);
  assert.match(env, /^SYNTHA_OUTBOX_RETENTION_MS=2592000000$/m);
  assert.match(env, /^SYNTHA_OUTBOX_WEBHOOK_URL=$/m);
});

test('retention policy cannot delete pending or unprojected wholesale outbox records', async () => {
  const store = await source('src/infrastructure/postgres-maintenance-store.mjs');
  assert.match(store, /source\.status = 'published'/);
  assert.match(store, /EXISTS \([\s\S]*notification_projections/);
  assert.match(store, /DELETE FROM notification_projections/);
  assert.match(store, /DELETE FROM outbox_events/);
  assert.doesNotMatch(store, /DELETE FROM notifications(?:\s|`)/);
  assert.doesNotMatch(store, /status = 'pending'/);
});
