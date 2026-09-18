import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const read = (name) => readFile(fileURLToPath(new URL(`../db/migrations/${name}`, import.meta.url)), 'utf8');

test('migration 065 backfills the canonical balance from catalog availability but initialises new identities at zero', async () => {
  const sql = await read('065_product_sku_inventory_reservation.sql');
  // The backfill reconciles the two counters for rows that already existed...
  assert.match(sql, /COALESCE\(catalog\.available_quantity, 0\)/);
  // ...while a ProductSku created afterwards starts empty, because it is created before it is
  // linked to a catalog SKU and there is nothing to copy yet. Migration 076 closes that gap.
  assert.match(sql, /initialize_product_sku_inventory_balance/);
});

test('migration 076 reconciles the canonical balance when a ProductSku is linked to its catalog SKU', async () => {
  const sql = await read('076_reconcile_product_sku_inventory_on_catalog_link.sql');

  assert.match(sql, /reconcile_product_sku_inventory_on_catalog_link/);
  assert.match(sql, /AFTER INSERT ON product_catalog_sku_links/);
  assert.match(sql, /FROM catalog_skus AS catalog/);
  assert.match(sql, /UPDATE product_sku_inventory_balances/);

  // The catalog figure is adopted only while the canonical balance is still untouched: a balance
  // that already carries movements is authoritative and must never be overwritten by the legacy
  // counter. Both the trigger and the one-off reconciliation carry that condition.
  const guards = sql.match(/available_quantity = 0\s*\n\s*AND\s+\w*\.?reserved_quantity = 0/g) ?? [];
  assert.ok(guards.length >= 2, `both the trigger and the backfill must guard on an untouched balance, found ${guards.length}`);

  // Forward-only: it must not rewrite the movement ledger or drop the balances it repairs.
  assert.doesNotMatch(sql, /DROP\s+TABLE/i);
  assert.doesNotMatch(sql, /DELETE\s+FROM\s+product_sku_inventory_balances/i);
  assert.doesNotMatch(sql, /UPDATE\s+inventory_movement_ledger_entries/i);
});
