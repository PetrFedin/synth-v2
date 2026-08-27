import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { migratePostgres } from '../../src/infrastructure/postgres-migrator.mjs';
import { ensureOwnerBootstrap, withOwnerBootstrapLock } from '../../src/operations/owner-bootstrap.mjs';
import { createPostgresWholesaleRuntime } from '../../src/runtime/postgres-runtime.mjs';

const { Pool } = pg;
const connectionString = process.env.POSTGRES_TEST_URL;

test('owner bootstrap is concurrency-safe, idempotent and does not rotate credentials', async () => {
  assert.ok(connectionString, 'POSTGRES_TEST_URL is required for PostgreSQL integration tests');
  const pool = new Pool({ connectionString, max: 6 });
  const migrationsDir = fileURLToPath(new URL('../../db/migrations/', import.meta.url));
  const suffix = randomUUID();
  const email = `owner-bootstrap-${suffix}@syntha.test`;
  const password = 'OwnerBootstrapIntegration!';
  const common = {
    email,
    password,
    displayName: 'Bootstrap Integration Owner',
    organisationName: `Bootstrap Brand ${suffix}`,
    organisationType: 'brand',
  };

  try {
    await migratePostgres({ pool, migrationsDir });
    const runtime = createPostgresWholesaleRuntime({ pool, migrationsDir });
    const execute = () => withOwnerBootstrapLock(pool, () => ensureOwnerBootstrap({
      pool,
      auth: runtime.auth,
      platform: runtime.platform,
      ...common,
    }));

    const [left, right] = await Promise.all([execute(), execute()]);
    const outcomes = [left, right].sort((a, b) => Number(b.created) - Number(a.created));
    assert.equal(outcomes[0].created, true);
    assert.equal(outcomes[1].created, false);
    assert.equal(outcomes[0].user.id, outcomes[1].user.id);
    assert.equal(outcomes[0].organisation.id, outcomes[1].organisation.id);
    assert.equal(outcomes[0].membership.id, outcomes[1].membership.id);
    assert.equal(outcomes[1].repaired, false);

    const third = await execute();
    assert.equal(third.created, false);
    assert.equal(third.repaired, false);
    assert.equal(third.user.id, left.user.id);
    assert.equal(third.organisation.id, left.organisation.id);

    await assert.rejects(
      withOwnerBootstrapLock(pool, () => ensureOwnerBootstrap({
        pool,
        auth: runtime.auth,
        platform: runtime.platform,
        ...common,
        password: 'DifferentIntegrationPassword!',
      })),
      /does not match the existing owner/,
    );

    await assert.rejects(
      withOwnerBootstrapLock(pool, () => ensureOwnerBootstrap({
        pool,
        auth: runtime.auth,
        platform: runtime.platform,
        ...common,
        organisationName: `${common.organisationName} changed`,
      })),
      /refusing to create another organisation implicitly/,
    );

    const persisted = await pool.query(
      `SELECT auth_user.id AS user_id,
              COUNT(DISTINCT membership.id)::int AS membership_count,
              COUNT(DISTINCT organisation.id)::int AS organisation_count,
              MAX(membership.role) AS role
         FROM auth_users AS auth_user
         JOIN memberships AS membership ON membership.user_id = auth_user.id
         JOIN organisations AS organisation ON organisation.id = membership.organisation_id
        WHERE auth_user.email_normalized = $1
        GROUP BY auth_user.id`,
      [email.toLowerCase()],
    );
    assert.equal(persisted.rows.length, 1);
    assert.deepEqual(persisted.rows[0], {
      user_id: left.user.id,
      membership_count: 1,
      organisation_count: 1,
      role: 'owner',
    });
  } finally {
    await pool.end();
  }
});
