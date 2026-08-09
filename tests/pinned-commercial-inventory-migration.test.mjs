import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('pinned commercial orders reserve live inventory from immutable order commit lines', async () => {
  const sql = await readFile(path.join(root, 'db', 'migrations', '031_pinned_commercial_inventory_reservation.sql'), 'utf8');

  assert.match(sql, /ALTER TABLE order_inventory_reservations/);
  assert.match(sql, /order_commit_snapshot_id TEXT NULL/);
  assert.match(sql, /lineage_version SMALLINT NOT NULL DEFAULT 1/);
  assert.match(sql, /REFERENCES order_commit_snapshots \(id, order_id\)/);
  assert.match(sql, /IF NEW\.order_commit_snapshot_id IS NOT NULL THEN/);
  assert.match(sql, /SELECT payload INTO commit_payload\s+FROM order_commit_snapshots/s);
  assert.match(sql, /line_source := COALESCE\(commit_payload->'lines', '\[\]'::jsonb\)/);
  assert.match(sql, /reservation_lineage_version := 2/);
  assert.match(sql, /CATALOG_SKU_LINEAGE_MISMATCH/);
  assert.match(sql, /next_reserved := catalog_row\.reserved_quantity \+ line_quantity/);
  assert.match(sql, /CATALOG_AVAILABILITY_EXCEEDED/);
  assert.match(sql, /NEW\.order_commit_snapshot_id,\s+reservation_lineage_version/s);

  const pinnedBranch = sql.match(/IF NEW\.order_commit_snapshot_id IS NOT NULL THEN([\s\S]*?)ELSE([\s\S]*?)END IF;/);
  assert.ok(pinnedBranch, 'expected distinct pinned and legacy reservation branches');
  assert.doesNotMatch(pinnedBranch[1], /catalog_row\.status\s*<>\s*'published'/);
  assert.doesNotMatch(pinnedBranch[1], /line_quantity\s*<\s*catalog_row\.minimum_order_quantity/);
  assert.match(pinnedBranch[2], /COALESCE\(NEW\.payload->'lines'/);
});
