import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);

test('supplier sourcing migration persists authoritative projections and state constraints', async () => {
  const migration = await readFile(path.join(root, 'db/migrations/019_supplier_sourcing.sql'), 'utf8');
  for (const fragment of [
    'CREATE TABLE IF NOT EXISTS suppliers',
    'CREATE TABLE IF NOT EXISTS sourcing_rfqs',
    'suppliers_payload_projection_check',
    'suppliers_state_timestamps_check',
    'sourcing_rfqs_payload_projection_check',
    'sourcing_rfqs_state_check',
    'FOREIGN KEY (brand_id, selected_supplier_code)',
    'sourcing_rfqs_supplier_codes_gin_idx',
  ]) assert.ok(migration.includes(fragment), `missing migration control: ${fragment}`);
  assert.match(migration, /status text NOT NULL CHECK \(status IN \('draft','issued','quoted','awarded','allocated','cancelled'\)\)/);
  assert.match(migration, /delivery_due_at > response_due_at/);
});

test('PostgreSQL sourcing store uses locks, optimistic versions, shared command ledger and transactional outbox', async () => {
  const source = await readFile(path.join(root, 'src/infrastructure/postgres-sourcing-store.mjs'), 'utf8');
  assert.match(source, /FOR UPDATE/);
  assert.match(source, /FOR SHARE/);
  assert.match(source, /version = \$17/);
  assert.match(source, /version = \$20/);
  assert.ok(source.includes("getRegisteredCommand(client, 'catalog'"));
  assert.ok(source.includes("INSERT INTO outbox_events"));
});

test('PostgreSQL sourcing reader enforces organisation membership on every supplier and RFQ read', async () => {
  const source = await readFile(path.join(root, 'src/infrastructure/postgres-sourcing-reader.mjs'), 'utf8');
  assert.ok(source.includes("membership.organisation_id = aggregate.brand_id"));
  assert.ok(source.includes("membership.organisation_id = supplier.brand_id"));
  assert.ok(source.includes("membership.organisation_id = rfq.brand_id"));
  assert.ok(source.includes("membership.status = 'active'"));
  assert.ok(source.includes("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY"));
});
