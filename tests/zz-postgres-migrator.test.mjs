import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFile, copyFile, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migratePostgres } from '../src/infrastructure/postgres-migrator.mjs';

const databaseUrl = process.env.POSTGRES_TEST_URL;

test('PostgreSQL migration ledger serializes runners and rejects changed history', { skip: !databaseUrl }, async () => {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: databaseUrl, max: 4 });
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const migrationsDir = path.join(root, 'db', 'migrations');
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'syntha-v2-migrations-'));
  const migrationFiles = [
    '001_wholesale_v2.sql',
    '002_auth.sql',
    '003_auth_security.sql',
    '004_catalog.sql',
    '005_catalog_availability.sql',
    '006_order_cancellation.sql',
    '007_notification_projection_claims.sql',
    '008_notification_pagination.sql',
    '009_outbox_publication_claims.sql',
    '010_outbox_dead_letter_recovery.sql',
    '011_global_command_registry.sql',
  ];
  try {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    const clock = () => '2026-07-31T12:00:00.000Z';
    const results = await Promise.all([
      migratePostgres({ pool, migrationsDir, clock }),
      migratePostgres({ pool, migrationsDir, clock }),
    ]);
    const applied = results.flatMap((result) => result.applied).sort();
    const skipped = results.flatMap((result) => result.skipped).sort();
    assert.deepEqual(applied, migrationFiles);
    assert.deepEqual(skipped, migrationFiles);

    const ledger = await pool.query('SELECT version, length(trim(checksum)) AS checksum_length FROM schema_migrations ORDER BY version');
    assert.deepEqual(ledger.rows, migrationFiles.map((version) => ({ version, checksum_length: 64 })));
    const tables = await pool.query(
      `SELECT to_regclass('public.organisations') AS organisations,
              to_regclass('public.auth_users') AS auth_users,
              to_regclass('public.auth_login_throttles') AS auth_login_throttles,
              to_regclass('public.catalog_skus') AS catalog_skus,
              to_regclass('public.order_inventory_reservations') AS order_inventory_reservations,
              to_regclass('public.notification_projection_claims') AS notification_projection_claims,
              to_regclass('public.outbox_publication_claims') AS outbox_publication_claims,
              to_regclass('public.outbox_dead_letters') AS outbox_dead_letters,
              to_regclass('public.outbox_dead_letter_audit') AS outbox_dead_letter_audit,
              to_regclass('public.command_registry') AS command_registry`,
    );
    assert.equal(tables.rows[0].organisations, 'organisations');
    assert.equal(tables.rows[0].auth_users, 'auth_users');
    assert.equal(tables.rows[0].auth_login_throttles, 'auth_login_throttles');
    assert.equal(tables.rows[0].catalog_skus, 'catalog_skus');
    assert.equal(tables.rows[0].order_inventory_reservations, 'order_inventory_reservations');
    assert.equal(tables.rows[0].notification_projection_claims, 'notification_projection_claims');
    assert.equal(tables.rows[0].outbox_publication_claims, 'outbox_publication_claims');
    assert.equal(tables.rows[0].outbox_dead_letters, 'outbox_dead_letters');
    assert.equal(tables.rows[0].outbox_dead_letter_audit, 'outbox_dead_letter_audit');
    assert.equal(tables.rows[0].command_registry, 'command_registry');

    const commandForeignKeys = await pool.query(
      `SELECT conrelid::regclass::text AS table_name, confrelid::regclass::text AS parent_table
         FROM pg_constraint
        WHERE conname IN (
          'commands_command_registry_fk',
          'catalog_commands_command_registry_fk',
          'notification_commands_command_registry_fk'
        )
        ORDER BY conrelid::regclass::text`,
    );
    assert.deepEqual(commandForeignKeys.rows, [
      { table_name: 'catalog_commands', parent_table: 'command_registry' },
      { table_name: 'commands', parent_table: 'command_registry' },
      { table_name: 'notification_commands', parent_table: 'command_registry' },
    ]);

    const commandScopeConstraint = await pool.query(
      `SELECT pg_get_constraintdef(oid) AS definition
         FROM pg_constraint
        WHERE conrelid = 'public.command_registry'::regclass
          AND contype = 'c'`,
    );
    assert.match(commandScopeConstraint.rows.map((row) => row.definition).join('\n'), /wholesale/);
    assert.match(commandScopeConstraint.rows.map((row) => row.definition).join('\n'), /catalog/);
    assert.match(commandScopeConstraint.rows.map((row) => row.definition).join('\n'), /notification/);

    const outboxStatusConstraint = await pool.query(
      `SELECT pg_get_constraintdef(oid) AS definition
         FROM pg_constraint
        WHERE conrelid = 'public.outbox_events'::regclass
          AND conname = 'outbox_events_status_check'`,
    );
    assert.match(outboxStatusConstraint.rows[0].definition, /dead-letter/);

    const recoveryConstraint = await pool.query(
      `SELECT pg_get_constraintdef(oid) AS definition
         FROM pg_constraint
        WHERE conrelid = 'public.outbox_dead_letter_audit'::regclass
          AND contype = 'c'
        ORDER BY conname`,
    );
    assert.match(recoveryConstraint.rows.map((row) => row.definition).join('\n'), /dead-lettered/);
    assert.match(recoveryConstraint.rows.map((row) => row.definition).join('\n'), /requeued/);

    const notificationPagination = await pool.query(
      `SELECT is_nullable, data_type
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'notifications'
          AND column_name = 'created_at'`,
    );
    assert.deepEqual(notificationPagination.rows, [{ is_nullable: 'NO', data_type: 'timestamp with time zone' }]);
    const notificationIndex = await pool.query("SELECT to_regclass('public.notifications_recipient_created_idx') AS index_name");
    assert.equal(notificationIndex.rows[0].index_name, 'notifications_recipient_created_idx');

    for (const file of migrationFiles) await copyFile(path.join(migrationsDir, file), path.join(tempDir, file));
    await appendFile(path.join(tempDir, '005_catalog_availability.sql'), '\n-- changed history must fail\n');
    await assert.rejects(
      () => migratePostgres({ pool, migrationsDir: tempDir, clock }),
      (error) => error?.code === 'MIGRATION_CHECKSUM_MISMATCH' && error.details?.file === '005_catalog_availability.sql',
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
    await pool.end();
  }
});
