import { invariant } from '../core/errors.mjs';

const LEDGERS = Object.freeze({
  wholesale: 'commands',
  catalog: 'catalog_commands',
  notification: 'notification_commands',
  'product-identity': 'product_identity_commands',
  'product-readiness': 'product_readiness_commands',
});

export async function getRegisteredCommand(client, scope, id) {
  const table = commandTable(scope);
  validateCommandId(id);
  await lockCommand(client, id);
  const result = await client.query(
    `SELECT registry.id AS registry_id,
            registry.scope AS registry_scope,
            registry.fingerprint AS registry_fingerprint,
            registry.actor_id AS registry_actor_id,
            registry.completed_at AS registry_completed_at,
            ledger.id AS ledger_id,
            ledger.fingerprint AS ledger_fingerprint,
            ledger.actor_id AS ledger_actor_id,
            ledger.result AS ledger_result,
            ledger.completed_at AS ledger_completed_at
       FROM command_registry AS registry
       FULL OUTER JOIN ${table} AS ledger ON ledger.id = registry.id
      WHERE COALESCE(registry.id, ledger.id) = $1`,
    [id],
  );
  const row = result.rows[0];
  if (!row) return undefined;

  if (row.registry_id) {
    invariant(row.registry_scope === scope, 'COMMAND_SCOPE_CONFLICT', 'Idempotency key is already assigned to another command scope', {
      commandId: id,
      requestedScope: scope,
      registeredScope: row.registry_scope,
    });
    invariant(row.ledger_id, 'COMMAND_LEDGER_INCONSISTENT', 'Global command registry entry has no matching command result', {
      commandId: id,
      scope,
    });
    assertMetadataMatches(row, id, scope);
    return commandFromJoinedRow(row);
  }

  invariant(row.ledger_id, 'COMMAND_LEDGER_INCONSISTENT', 'Command lookup returned an invalid ledger row', { commandId: id, scope });
  await insertRegistryRow(client, scope, {
    id: row.ledger_id,
    fingerprint: row.ledger_fingerprint,
    actorId: row.ledger_actor_id,
    completedAt: timestamp(row.ledger_completed_at),
  });
  return commandFromJoinedRow(row);
}

export async function insertRegisteredCommand(client, scope, value) {
  const table = commandTable(scope);
  validateCommand(value);
  await lockCommand(client, value.id);
  try {
    await insertRegistryRow(client, scope, value);
  } catch (error) {
    if (error?.code !== '23505') throw error;
    const existing = await client.query(
      'SELECT scope, fingerprint, actor_id, completed_at FROM command_registry WHERE id = $1',
      [value.id],
    );
    const row = existing.rows[0];
    invariant(row?.scope === scope, 'COMMAND_SCOPE_CONFLICT', 'Idempotency key is already assigned to another command scope', {
      commandId: value.id,
      requestedScope: scope,
      registeredScope: row?.scope ?? null,
    });
    invariant(false, 'COMMAND_ALREADY_EXISTS', 'Command already exists', { commandId: value.id, scope });
  }

  try {
    await client.query(
      `INSERT INTO ${table} (id, fingerprint, actor_id, result, completed_at)
       VALUES ($1, $2, $3, $4::jsonb, $5)`,
      [value.id, value.fingerprint, value.actorId, JSON.stringify(value.result), value.completedAt],
    );
  } catch (error) {
    if (error?.code === '23505') invariant(false, 'COMMAND_ALREADY_EXISTS', 'Command already exists', { commandId: value.id, scope });
    throw error;
  }
}

async function lockCommand(client, id) {
  await client.query(
    'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
    [`command:${id}`],
  );
}

async function insertRegistryRow(client, scope, value) {
  await client.query(
    `INSERT INTO command_registry (id, scope, fingerprint, actor_id, completed_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [value.id, scope, value.fingerprint, value.actorId, value.completedAt],
  );
}

function commandTable(scope) {
  const table = LEDGERS[scope];
  invariant(table, 'COMMAND_SCOPE_INVALID', 'Command scope is invalid', { scope });
  return table;
}

function validateCommand(value) {
  invariant(value && typeof value === 'object', 'COMMAND_INVALID', 'Command is required');
  validateCommandId(value.id);
  invariant(typeof value.fingerprint === 'string' && value.fingerprint.length > 0, 'COMMAND_FINGERPRINT_INVALID', 'Command fingerprint is invalid');
  invariant(typeof value.actorId === 'string' && value.actorId.length > 0, 'COMMAND_ACTOR_INVALID', 'Command actor is invalid');
  invariant(value.result !== undefined, 'COMMAND_RESULT_INVALID', 'Command result is required');
  invariant(typeof value.completedAt === 'string' && Number.isFinite(Date.parse(value.completedAt)), 'COMMAND_COMPLETED_AT_INVALID', 'Command completion timestamp is invalid');
}

function validateCommandId(id) {
  invariant(typeof id === 'string' && id.length > 0, 'COMMAND_ID_INVALID', 'Command id is invalid');
}

function assertMetadataMatches(row, id, scope) {
  const registryCompletedAt = timestamp(row.registry_completed_at);
  const ledgerCompletedAt = timestamp(row.ledger_completed_at);
  invariant(
    row.registry_fingerprint === row.ledger_fingerprint
      && row.registry_actor_id === row.ledger_actor_id
      && registryCompletedAt === ledgerCompletedAt,
    'COMMAND_LEDGER_INCONSISTENT',
    'Global command registry metadata does not match the command result',
    { commandId: id, scope },
  );
}

function commandFromJoinedRow(row) {
  return Object.freeze({
    id: row.ledger_id,
    fingerprint: row.ledger_fingerprint,
    actorId: row.ledger_actor_id,
    result: row.ledger_result,
    completedAt: timestamp(row.ledger_completed_at),
  });
}

function timestamp(value) {
  return value?.toISOString?.() ?? value;
}
