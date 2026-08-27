import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import {
  ensureAcceptanceBrandOwner,
  loginAcceptanceSession,
  logoutAcceptanceSession,
  runCollectionLiveAcceptance,
} from '../../src/acceptance/collection-live-acceptance.mjs';
import { bootstrapProductionAcceptanceReferences } from '../../src/acceptance/production-reference-bootstrap.mjs';
import { migratePostgres } from '../../src/infrastructure/postgres-migrator.mjs';
import { createPostgresWholesaleRuntime } from '../../src/runtime/postgres-runtime.mjs';

const { Pool } = pg;
const connectionString = process.env.POSTGRES_TEST_URL;
const email = 'collection-acceptance@syntha.test';
const password = 'CollectionAcceptanceTest!';

test('collection live acceptance crosses the real HTTP and PostgreSQL boundary without downstream writes', async () => {
  assert.ok(connectionString, 'POSTGRES_TEST_URL is required for PostgreSQL integration tests');
  const pool = new Pool({ connectionString, max: 4 });
  const migrationsDir = fileURLToPath(new URL('../../db/migrations/', import.meta.url));
  let server;
  let token;
  let baseUrl;

  try {
    await migratePostgres({ pool, migrationsDir });
    const runtime = createPostgresWholesaleRuntime({ pool, migrationsDir });
    const references = await bootstrapProductionAcceptanceReferences({ platform: runtime.platform });
    await ensureAcceptanceBrandOwner({ pool, auth: runtime.auth, email, password });

    server = createServer(runtime.handler);
    baseUrl = await listenLocal(server);
    const session = await loginAcceptanceSession({ baseUrl, email, password });
    token = session.token;

    const result = await runCollectionLiveAcceptance({
      baseUrl,
      token,
      pool,
      references,
      runId: 'postgres-live-collection',
    });

    assert.equal(result.status, 'passed');
    assert.equal(result.actorId, references.actors.brandOwner);
    assert.equal(result.campaign.status, 'open');
    assert.equal(result.collection.status, 'published');
    assert.equal(result.persistence.verified, true);
    assert.equal(result.persistence.campaignId, result.campaign.id);
    assert.equal(result.persistence.collectionId, result.collection.id);
    assert.equal(result.isolation.unchanged, true);

    const downstream = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM selections WHERE brand_id = $1)::int AS selections,
         (SELECT COUNT(*) FROM orders WHERE brand_id = $1)::int AS orders,
         (SELECT COUNT(*) FROM commercial_publications WHERE brand_id = $1)::int AS publications,
         (SELECT COUNT(*) FROM inventory_movement_ledger_entries WHERE brand_id = $1)::int AS movements,
         (SELECT COUNT(*) FROM supply_commitment_snapshots WHERE brand_id = $1)::int AS supply_commitments,
         (SELECT COUNT(*) FROM actual_cost_ledger_entries WHERE brand_id = $1)::int AS actual_cost_entries`,
      [references.brand.id],
    );
    assert.deepEqual(downstream.rows[0], {
      selections: 0,
      orders: 0,
      publications: 0,
      movements: 0,
      supply_commitments: 0,
      actual_cost_entries: 0,
    });
  } finally {
    if (token && baseUrl) {
      try { await logoutAcceptanceSession({ baseUrl, token }); }
      catch { /* best effort after assertion failure */ }
    }
    if (server) await closeServer(server);
    await pool.end();
  }
});

function listenLocal(server) {
  return new Promise((resolve, reject) => {
    const onError = (error) => reject(error);
    server.once('error', onError);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', onError);
      const address = server.address();
      assert.ok(address && typeof address === 'object');
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}
