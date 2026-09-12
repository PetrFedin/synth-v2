const LEGACY_INSERT_GUARDS = Object.freeze([
  ['selections', 'selections_000_canonical_new_write'],
  ['orders', 'orders_000_canonical_new_write'],
  ['order_commit_snapshots', 'order_commit_000_canonical_new_write'],
]);

/**
 * Test-only compatibility helper for facts that represent history predating
 * migration 076. Production code must never disable these guards.
 *
 * The helper deliberately disables only forward-only INSERT guards. UPDATE
 * guards remain active, and migration 076 itself still validates every fresh
 * canonical write. PostgreSQL verification runs serially, so the short DDL
 * window cannot race another repository test.
 */
export async function withLegacyCommercialInsertGuardsDisabled(pool, action) {
  if (!pool || typeof pool.connect !== 'function') throw new TypeError('PostgreSQL pool is required');
  if (typeof action !== 'function') throw new TypeError('Historical fixture action is required');

  const client = await pool.connect();
  const disabled = [];
  let result;
  let actionError = null;
  let restoreError = null;
  try {
    for (const [table, trigger] of LEGACY_INSERT_GUARDS) {
      await client.query(`ALTER TABLE ${table} DISABLE TRIGGER ${trigger}`);
      disabled.push([table, trigger]);
    }
    try {
      result = await action(client);
    } catch (error) {
      actionError = error;
    }
  } finally {
    for (const [table, trigger] of disabled.reverse()) {
      try {
        await client.query(`ALTER TABLE ${table} ENABLE TRIGGER ${trigger}`);
      } catch (error) {
        restoreError ??= error;
      }
    }
    client.release();
  }

  if (actionError) throw actionError;
  if (restoreError) throw restoreError;
  return result;
}