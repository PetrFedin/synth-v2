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
 * canonical write. PostgreSQL verification runs serially. The setup client is
 * released before the fixture action so low-capacity pools cannot deadlock while
 * the explicit historical fixture is being constructed.
 */
export async function withLegacyCommercialInsertGuardsDisabled(pool, action) {
  if (!pool || typeof pool.connect !== 'function') throw new TypeError('PostgreSQL pool is required');
  if (typeof action !== 'function') throw new TypeError('Historical fixture action is required');

  const disabled = [];
  let result;
  let actionError = null;
  let restoreError = null;

  const setupClient = await pool.connect();
  try {
    for (const [table, trigger] of LEGACY_INSERT_GUARDS) {
      await setupClient.query(`ALTER TABLE ${table} DISABLE TRIGGER ${trigger}`);
      disabled.push([table, trigger]);
    }
  } catch (error) {
    actionError = error;
  } finally {
    setupClient.release();
  }

  if (!actionError) {
    try {
      result = await action(pool);
    } catch (error) {
      actionError = error;
    }
  }

  if (disabled.length) {
    const restoreClient = await pool.connect();
    try {
      for (const [table, trigger] of disabled.reverse()) {
        try {
          await restoreClient.query(`ALTER TABLE ${table} ENABLE TRIGGER ${trigger}`);
        } catch (error) {
          restoreError ??= error;
        }
      }
    } finally {
      restoreClient.release();
    }
  }

  if (actionError) throw actionError;
  if (restoreError) throw restoreError;
  return result;
}
