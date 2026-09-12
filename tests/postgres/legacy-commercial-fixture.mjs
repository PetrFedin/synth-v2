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
  try {
    for (const [table, trigger] of LEGACY_INSERT_GUARDS) {
      await client.query(`ALTER TABLE ${table} DISABLE TRIGGER ${trigger}`);
      disabled.push([table, trigger]);
    }
    return await action(client);
  } finally {
    for (const [table, trigger] of disabled.reverse()) {
      try {
        await client.query(`ALTER TABLE ${table} ENABLE TRIGGER ${trigger}`);
      } catch {
        // Preserve the primary test failure. The ephemeral verification DB is
        // discarded after the job; later migration inspection will also fail
        // closed if the database is unusable.
      }
    }
    client.release();
  }
}