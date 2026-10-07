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

test('EntityThread, messages and Decision Ledger persist atomically on real PostgreSQL', async () => {
  assert.ok(connectionString, 'POSTGRES_TEST_URL is required for PostgreSQL integration tests');
  const pool = new Pool({ connectionString, max: 6 });
  const migrationsDir = fileURLToPath(new URL('../../db/migrations/', import.meta.url));
  const suffix = randomUUID();
  const email = `operational-collaboration-${suffix}@syntha.test`;
  const password = 'OperationalCollaborationIntegration!';

  try {
    await migratePostgres({ pool, migrationsDir });
    const runtime = createPostgresWholesaleRuntime({ pool, migrationsDir });
    const owner = await withOwnerBootstrapLock(pool, () => ensureOwnerBootstrap({
      pool,
      auth: runtime.auth,
      platform: runtime.platform,
      email,
      password,
      displayName: 'Operational Collaboration Owner',
      organisationName: `Operational Collaboration Brand ${suffix}`,
      organisationType: 'brand',
    }));

    const organisationId = owner.organisation.id;
    const actorId = owner.user.id;
    const entity = { type: 'sample', id: `sample-${suffix}`, version: 2, contentHash: 'a'.repeat(64) };

    const thread = await runtime.operationalCollaboration.createThread(`oc-thread-${suffix}`, actorId, {
      ownerOrganisationId: organisationId,
      participantOrganisationIds: [],
      entity,
      title: 'Fit review evidence',
      kind: 'fit',
    });
    const message = await runtime.operationalCollaboration.postMessage(`oc-message-${suffix}`, actorId, thread.id, {
      actingOrganisationId: organisationId,
      body: 'Sleeve balance requires another sample.',
      evidenceRefs: [`evidence-${suffix}`],
    });
    const first = await runtime.operationalCollaboration.recordDecision(`oc-decision-1-${suffix}`, actorId, {
      actingOrganisationId: organisationId,
      threadId: thread.id,
      entity,
      decisionType: 'fit-review',
      outcome: 'deferred',
      rationale: 'Await the corrected sleeve sample.',
      evidenceRefs: [message.id],
    });

    const replacementInput = (commandId, version, hash) => runtime.operationalCollaboration.recordDecision(commandId, actorId, {
      actingOrganisationId: organisationId,
      threadId: thread.id,
      entity: { ...entity, version, contentHash: hash.repeat(64) },
      decisionType: 'fit-review',
      outcome: 'approved',
      rationale: 'Corrected sample accepted.',
      supersedesDecisionId: first.id,
    });
    const competing = await Promise.allSettled([
      replacementInput(`oc-decision-2a-${suffix}`, 3, 'b'),
      replacementInput(`oc-decision-2b-${suffix}`, 4, 'c'),
    ]);
    assert.equal(competing.filter((item) => item.status === 'fulfilled').length, 1);
    const rejected = competing.find((item) => item.status === 'rejected');
    assert.ok(rejected);
    assert.equal(rejected.reason?.code, 'DECISION_ALREADY_SUPERSEDED');

    const view = await runtime.operationalCollaboration.forEntity(actorId, entity.type, entity.id);
    assert.equal(view.threads.length, 1);
    assert.equal(view.threads[0].messages.length, 1);
    assert.equal(view.decisions.length, 2);

    const persisted = await pool.query(
      `SELECT
        (SELECT count(*)::int FROM operational_threads WHERE id=$1) AS threads,
        (SELECT count(*)::int FROM operational_thread_participants WHERE thread_id=$1) AS participants,
        (SELECT count(*)::int FROM operational_thread_messages WHERE thread_id=$1) AS messages,
        (SELECT count(*)::int FROM operational_decisions WHERE entity_type=$2 AND entity_id=$3) AS decisions,
        (SELECT count(*)::int FROM command_registry WHERE scope='operational-collaboration' AND id LIKE $4) AS registered_commands,
        (SELECT count(*)::int FROM operational_collaboration_commands WHERE id LIKE $4) AS ledger_commands,
        (SELECT count(*)::int FROM outbox_events WHERE event->'metadata'->>'commandId' LIKE $4) AS operational_events`,
      [thread.id, entity.type, entity.id, `oc-%-${suffix}`],
    );
    assert.deepEqual(persisted.rows[0], {
      threads: 1,
      participants: 1,
      messages: 1,
      decisions: 2,
      registered_commands: 4,
      ledger_commands: 4,
      operational_events: 4,
    });

    const replay = await runtime.operationalCollaboration.postMessage(`oc-message-${suffix}`, actorId, thread.id, {
      actingOrganisationId: organisationId,
      body: 'Sleeve balance requires another sample.',
      evidenceRefs: [`evidence-${suffix}`],
    });
    assert.equal(replay.id, message.id);
    const messageCount = await pool.query('SELECT count(*)::int AS count FROM operational_thread_messages WHERE thread_id=$1', [thread.id]);
    assert.equal(messageCount.rows[0].count, 1);
  } finally {
    await pool.end();
  }
});
