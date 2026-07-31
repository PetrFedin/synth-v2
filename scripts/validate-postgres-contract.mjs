import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = path.join(root, 'db', 'migrations');
const files = (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort();
const sql = (await Promise.all(files.map((file) => readFile(path.join(directory, file), 'utf8')))).join('\n');
const requiredTables = [
  'organisations', 'memberships', 'counterparty_relationships', 'campaigns', 'collections', 'showrooms',
  'showroom_invitations', 'commercial_cycles', 'selections', 'orders', 'deals', 'calendar_milestones',
  'commands', 'outbox_events', 'notifications', 'notification_projections', 'notification_commands',
  'auth_users', 'auth_sessions', 'auth_login_throttles', 'auth_login_audit',
  'catalog_skus', 'catalog_commands', 'catalog_outbox_events', 'order_inventory_reservations',
];
const requiredFragments = [
  'UNIQUE (brand_id, shop_id)', 'UNIQUE (showroom_id, shop_id)', 'cycle_id text NOT NULL UNIQUE',
  "status text NOT NULL CHECK (status IN ('pending', 'published'))", 'outbox_status_idx',
  'notifications_recipient_status_idx', 'version integer NOT NULL CHECK (version > 0)',
  'email_normalized text NOT NULL UNIQUE', 'token_hash char(64) NOT NULL UNIQUE', 'auth_sessions_expiry_idx',
  "outcome text NOT NULL CHECK (outcome IN ('succeeded', 'failed', 'blocked'))", 'auth_login_throttles_blocked_idx',
  'auth_login_audit_key_time_idx', "status text NOT NULL CHECK (status IN ('draft', 'published'))",
  'wholesale_price numeric(20, 4) NOT NULL CHECK (wholesale_price > 0)', 'catalog_skus_collection_status_idx',
  'catalog_outbox_status_idx', 'minimum_order_quantity integer NOT NULL DEFAULT 1',
  'available_quantity integer NOT NULL DEFAULT 0', 'reserved_quantity integer NOT NULL DEFAULT 0',
  'catalog_skus_reserved_not_above_available', 'order_inventory_reservations_sku_idx',
  'reserve_inventory_on_order_attach', 'orders_reserve_inventory_on_attach', 'FOR UPDATE',
];
const missing = [];
for (const table of requiredTables) if (!new RegExp(`CREATE TABLE IF NOT EXISTS\\s+${table}\\s*\\(`, 'i').test(sql)) missing.push(`table:${table}`);
for (const fragment of requiredFragments) if (!sql.includes(fragment)) missing.push(`contract:${fragment}`);
if (missing.length) {
  console.error(`PostgreSQL contract is incomplete:\n${missing.map((item) => `- ${item}`).join('\n')}`);
  process.exit(1);
}
console.log(`PostgreSQL contract OK (${requiredTables.length} tables across ${files.length} migrations).`);
