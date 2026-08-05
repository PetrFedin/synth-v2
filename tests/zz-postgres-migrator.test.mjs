import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
    '001_wholesale_v2.sql','002_auth.sql','003_auth_security.sql','004_catalog.sql','005_catalog_availability.sql',
    '006_order_cancellation.sql','007_notification_projection_claims.sql','008_notification_pagination.sql',
    '009_outbox_publication_claims.sql','010_outbox_dead_letter_recovery.sql','011_global_command_registry.sql',
    '012_workspace_paging_indexes.sql','013_catalog_search_indexes.sql','014_material_master.sql',
    '015_unify_catalog_outbox.sql','016_bom_costing.sql','017_measurement_charts.sql','018_samples.sql',
    '019_supplier_sourcing.sql','020_tech_packs.sql','021_sourcing_tech_pack_gate.sql',
  ];
  try {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    const clock = () => '2026-08-04T12:00:00.000Z';
    const results = await Promise.all([migratePostgres({ pool, migrationsDir, clock }), migratePostgres({ pool, migrationsDir, clock })]);
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
              to_regclass('public.materials') AS materials,
              to_regclass('public.boms') AS boms,
              to_regclass('public.bom_lines') AS bom_lines,
              to_regclass('public.measurement_charts') AS measurement_charts,
              to_regclass('public.measurement_chart_revisions') AS measurement_chart_revisions,
              to_regclass('public.measurement_chart_sizes') AS measurement_chart_sizes,
              to_regclass('public.measurement_points') AS measurement_points,
              to_regclass('public.measurement_values') AS measurement_values,
              to_regclass('public.samples') AS samples,
              to_regclass('public.suppliers') AS suppliers,
              to_regclass('public.sourcing_rfqs') AS sourcing_rfqs,
              to_regclass('public.tech_packs') AS tech_packs,
              to_regclass('public.order_inventory_reservations') AS order_inventory_reservations,
              to_regclass('public.notification_projection_claims') AS notification_projection_claims,
              to_regclass('public.outbox_publication_claims') AS outbox_publication_claims,
              to_regclass('public.outbox_dead_letters') AS outbox_dead_letters,
              to_regclass('public.outbox_dead_letter_audit') AS outbox_dead_letter_audit,
              to_regclass('public.command_registry') AS command_registry`,
    );
    for (const [name, value] of Object.entries(tables.rows[0])) assert.equal(value, name);

    const gateColumns = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'sourcing_rfqs' AND column_name LIKE 'tech_pack_%' ORDER BY column_name");
    assert.deepEqual(gateColumns.rows.map((row) => row.column_name), ['tech_pack_acknowledged_at','tech_pack_acknowledgement_reference','tech_pack_code','tech_pack_gate_enforced','tech_pack_issued_version','tech_pack_revision','tech_pack_version']);
    assert.deepEqual((await pool.query("SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.sourcing_rfqs'::regclass AND tgname = 'sourcing_rfqs_tech_pack_gate' AND NOT tgisinternal")).rows, [{ tgname: 'sourcing_rfqs_tech_pack_gate' }]);

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
    assert.match(commandScope, /wholesale/); assert.match(commandScope, /catalog/); assert.match(commandScope, /notification/);

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

    const recoveryConstraint = await pool.query("SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid = 'public.outbox_dead_letter_audit'::regclass AND contype = 'c' ORDER BY conname");
    const recovery = recoveryConstraint.rows.map((row) => row.definition).join('\n');
    assert.match(recovery, /dead-lettered/); assert.match(recovery, /requeued/);
    const notificationPagination = await pool.query("SELECT is_nullable, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'created_at'");
    assert.deepEqual(notificationPagination.rows, [{ is_nullable: 'NO', data_type: 'timestamp with time zone' }]);
    assert.equal((await pool.query("SELECT to_regclass('public.notifications_recipient_created_idx') AS index_name")).rows[0].index_name, 'notifications_recipient_created_idx');

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
