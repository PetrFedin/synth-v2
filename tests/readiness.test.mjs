import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createWholesaleHttpServer } from '../src/http/api.mjs';
import { createWholesaleFetchHandler } from '../src/http/fetch-api.mjs';
import { createPostgresReadinessService } from '../src/application/readiness-service.mjs';

function transport(readiness) {
  const services = {
    authenticate: async () => null,
    auth: {},
    readiness,
    platform: {},
    partners: {},
    collaboration: {},
    orders: {},
    notifications: {},
    workspace: {},
    nextRequestId: () => 'request-ready',
  };
  return services;
}

async function withServer(server, work) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  try { return await work(`http://127.0.0.1:${port}`); }
  finally { server.close(); await once(server, 'close'); }
}

test('Node and Fetch readiness endpoints return 200 only for ready status', async () => {
  const ready = Object.freeze({
    status: 'ready',
    service: 'syntha-wholesale-v2',
    checkedAt: '2026-07-31T13:00:00.000Z',
    database: { status: 'available' },
    migrations: { status: 'current', totalCount: 2, appliedCount: 2, pending: [], mismatched: [], unknown: [] },
  });
  await withServer(createWholesaleHttpServer(transport({ check: async () => ready })), async (base) => {
    const response = await fetch(`${base}/ready`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, 'ready');
  });

  const notReady = Object.freeze({ ...ready, status: 'not-ready', reason: 'migration-drift', migrations: { ...ready.migrations, status: 'drift', mismatched: ['002_auth.sql'] } });
  const fetchHandler = createWholesaleFetchHandler(transport({ check: async () => notReady }));
  const response = await fetchHandler(new Request('http://syntha.local/ready'));
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.equal(body.reason, 'migration-drift');
  assert.equal(body.requestId, 'request-ready');
});

test('database failures are reported without leaking the original error', async () => {
  const readiness = createPostgresReadinessService({
    pool: { query: async () => { throw new Error('postgresql://secret-user:secret-password@db.internal/syntha'); } },
    migrationsDir: '/unused',
    clock: () => '2026-07-31T13:00:00.000Z',
  });
  const result = await readiness.check();
  assert.equal(result.status, 'not-ready');
  assert.equal(result.reason, 'database-unavailable');
  assert.equal(JSON.stringify(result).includes('secret-password'), false);
});
