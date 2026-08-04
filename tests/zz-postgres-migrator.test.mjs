import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migratePostgres } from '../src/infrastructure/postgres-migrator.mjs';

const databaseUrl = process.env.POSTGRES_TEST_URL;
const migrationFiles = Object.freeze([
  '001_wholesale_v2.sql', '002_auth.sql', '003_auth_security.sql', '004_catalog.sql', '005_catalog_availability.sql',
  '006_order_cancellation.sql', '007_notification_projection_claims.sql', '008_notification_pagination.sql',
  '009_outbox_publication_claims.sql', '010_outbox_dead_letter_recovery.sql', '011_global_command_registry.sql',
  '012_workspace_paging_indexes.sql', '013_catalog_search_indexes.sql', '014_material_master.sql',
  '015_unify_catalog_outbox.sql', '016_bom_costing.sql', '017_measurement_charts.sql', '018_samples.sql',
]);
const governedTables = Object.freeze([
  'organisations', 'auth_users', 'auth_login_throttles', 'catalog_skus', 'materials', 'boms', 'bom_lines',
  'measurement_charts', 'measurement_chart_revisions', 'measurement_chart_sizes', 'measurement_points', 'measurement_values',
  'samples', 'order_inventory_reservations', 'notification_projection_claims', 'outbox_publication_claims',
  'outbox_dead_letters', 'outbox_dead_letter_audit', 'command_registry',
]);

test('PostgreSQL migration ledger serializes runners, exposes all governed tables and rejects changed history', { skip: !databaseUrl }, async () => {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: databaseUrl, max: 4 });
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const migrationsDir = path.join(root, 'db', 'migrations');
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'syntha-v2-migrations-'));
  try {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    const clock = () => '2026-08-04T12:00:00.000Z';
    const results = await Promise.all([migratePostgres({ pool, migrationsDir, clock }), migratePostgres({ pool, migrationsDir, clock })]);
    assert.deepEqual(results.flatMap((result) => result.applied).sort(), [...migrationFiles]);
    assert.deepEqual(results.flatMap((result) => result.skipped).sort(), [...migrationFiles]);

    const ledger = await pool.query('SELECT version, length(trim(checksum)) AS checksum_length FROM schema_migrations ORDER BY version');
    assert.deepEqual(ledger.rows, migrationFiles.map((version) => ({ version, checksum_length: 64 })));

    const tableQuery = governedTables.map((name) => `to_regclass('public.${name}')::text AS ${name}`).join(',\n');
    const tables = await pool.query(`SELECT ${tableQuery}`);
    for (const [name, value] of Object.entries(tables.rows[0])) assert.equal(value, name);

    const commandForeignKeys = await pool.query(
      `SELECT conrelid::regclass::text AS table_name, confrelid::regclass::text AS parent_table
         FROM pg_constraint
        WHERE conname IN ('commands_command_registry_fk','catalog_commands_command_registry_fk','notification_commands_command_registry_fk')
        ORDER BY conrelid::regclass::text`,
    );
    assert.deepEqual(commandForeignKeys.rows, [
      { table_name: 'catalog_commands', parent_table: 'command_registry' },
      { table_name: 'commands', parent_table: 'command_registry' },
      { table_name: 'notification_commands', parent_table: 'command_registry' },
    ]);

    const commandScopeConstraint = await pool.query("SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid = 'public.command_registry'::regclass AND contype = 'c'");
    const commandScope = commandScopeConstraint.rows.map((row) => row.definition).join('\n');
    assert.match(commandScope, /wholesale/);
    assert.match(commandScope, /catalog/);
    assert.match(commandScope, /notification/);

    const outboxStatusConstraint = await pool.query("SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid = 'public.outbox_events'::regclass AND conname = 'outbox_events_status_check'");
    assert.match(outboxStatusConstraint.rows[0].definition, /dead-letter/);
    const outboxMirrorTrigger = await pool.query("SELECT trigger.tgname FROM pg_trigger AS trigger WHERE trigger.tgrelid = 'public.catalog_outbox_events'::regclass AND NOT trigger.tgisinternal");
    assert.deepEqual(outboxMirrorTrigger.rows, [{ tgname: 'catalog_outbox_unified_mirror' }]);

    const legacyEvent = { id: 'legacy-catalog-event-1', type: 'catalog-sku.created', aggregateId: 'SKU-LEGACY', occurredAt: '2026-08-03T12:00:00.000Z', payload: { brandId: 'brand-1' }, metadata: { commandId: 'legacy-command-1', actorId: 'user-1' } };
    await pool.query("INSERT INTO catalog_outbox_events (id, event_type, aggregate_id, status, event, published_at) VALUES ($1, $2, $3, 'pending', $4::jsonb, NULL)", [legacyEvent.id, legacyEvent.type, legacyEvent.aggregateId, JSON.stringify(legacyEvent)]);
    const mirrored = await pool.query('SELECT event_type, aggregate_id, status, event FROM outbox_events WHERE id = $1', [legacyEvent.id]);
    assert.deepEqual(mirrored.rows, [{ event_type: legacyEvent.type, aggregate_id: legacyEvent.aggregateId, status: 'pending', event: legacyEvent }]);
    await pool.query("UPDATE outbox_events SET status = 'published', published_at = '2026-08-03T13:00:00.000Z' WHERE id = $1", [legacyEvent.id]);
    await pool.query("UPDATE catalog_outbox_events SET status = 'pending', published_at = NULL WHERE id = $1", [legacyEvent.id]);
    assert.deepEqual((await pool.query('SELECT status FROM outbox_events WHERE id = $1', [legacyEvent.id])).rows, [{ status: 'published' }]);

    for (const file of migrationFiles) await copyFile(path.join(migrationsDir, file), path.join(tempDir, file));
    const changedMigrationPath = path.join(tempDir, '005_catalog_availability.sql');
    const originalMigrationSql = await readFile(changedMigrationPath, 'utf8');
    const changedMigrationSql = originalMigrationSql.replace(/COMMIT;\s*$/i, '-- changed history must fail\nCOMMIT;\n');
    assert.notEqual(changedMigrationSql, originalMigrationSql);
    await writeFile(changedMigrationPath, changedMigrationSql, 'utf8');
    await assert.rejects(() => migratePostgres({ pool, migrationsDir: tempDir, clock }), (error) => error?.code === 'MIGRATION_CHECKSUM_MISMATCH' && error.details?.file === '005_catalog_availability.sql');
  } finally {
    await rm(tempDir, { recursive: true, force: true });
    await pool.end();
  }
});
