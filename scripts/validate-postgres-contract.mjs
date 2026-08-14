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
  'showroom_invitations', 'retail_doors', 'commercial_cycles', 'selections', 'orders', 'deals', 'calendar_milestones',
  'commands', 'command_registry', 'outbox_events', 'notifications', 'notification_projections', 'notification_commands',
  'notification_projection_claims', 'outbox_publication_claims', 'outbox_dead_letters', 'outbox_dead_letter_audit',
  'auth_users', 'auth_sessions', 'auth_login_throttles', 'auth_login_audit',
  'catalog_skus', 'materials', 'boms', 'bom_lines', 'catalog_commands', 'catalog_outbox_events', 'order_inventory_reservations',
];
const requiredFragments = [
  'UNIQUE (brand_id, shop_id)', 'UNIQUE (showroom_id, shop_id)', 'UNIQUE (shop_id, code)', 'cycle_id text NOT NULL UNIQUE',
  'retail_doors_shop_status_idx', 'ADD COLUMN retail_door_id text NULL REFERENCES retail_doors(id)', 'ADD COLUMN retail_door_version integer NULL CHECK (retail_door_version > 0)',
  "status text NOT NULL CHECK (status IN ('pending', 'published'))", 'outbox_status_idx',
  "CHECK (status IN ('pending', 'published', 'dead-letter'))",
  "scope text NOT NULL CHECK (scope IN ('wholesale', 'catalog', 'notification'))",
  'command_registry_completed_idx', 'commands_command_registry_fk', 'catalog_commands_command_registry_fk', 'notification_commands_command_registry_fk',
  'duplicate command ids exist across command ledgers', 'outbox_publication_claims_token_idx', 'outbox_publication_claims_schedule_idx',
  'claim_token text NOT NULL', 'next_attempt_at timestamptz NOT NULL', 'outbox_dead_letters_failed_at_idx',
  "action text NOT NULL CHECK (action IN ('dead-lettered', 'requeued'))", 'outbox_dead_letter_audit_event_idx', 'outbox_dead_letter_audit_time_idx',
  "action = 'requeued' AND actor_id IS NOT NULL AND reason IS NOT NULL", 'notifications_recipient_status_idx', 'notifications_recipient_created_idx',
  'ADD COLUMN IF NOT EXISTS created_at timestamptz', 'ALTER COLUMN created_at SET NOT NULL', 'version integer NOT NULL CHECK (version > 0)',
  'notification_projection_claims_lease_idx', 'lease_expires_at timestamptz NOT NULL', 'attempt_count integer NOT NULL DEFAULT 1 CHECK (attempt_count > 0)',
  'email_normalized text NOT NULL UNIQUE', 'token_hash char(64) NOT NULL UNIQUE', 'auth_sessions_expiry_idx',
  "outcome text NOT NULL CHECK (outcome IN ('succeeded', 'failed', 'blocked'))", 'auth_login_throttles_blocked_idx',
  'auth_login_audit_key_time_idx', "status text NOT NULL CHECK (status IN ('draft', 'published'))",
  'wholesale_price numeric(20, 4) NOT NULL CHECK (wholesale_price > 0)', 'catalog_skus_collection_status_idx',
  'catalog_outbox_status_idx', 'minimum_order_quantity integer NOT NULL DEFAULT 1', 'available_quantity integer NOT NULL DEFAULT 0',
  'reserved_quantity integer NOT NULL DEFAULT 0', 'catalog_skus_reserved_not_above_available', 'order_inventory_reservations_sku_idx',
  'reserve_inventory_on_order_attach', 'orders_reserve_inventory_on_attach', 'FOR UPDATE',
  "material_type text NOT NULL CHECK (material_type IN ('fabric', 'trim', 'packaging', 'other'))",
  "unit text NOT NULL CHECK (unit IN ('m', 'kg', 'pc', 'yd'))", 'unit_cost numeric(20, 4) NOT NULL CHECK (unit_cost > 0)',
  'materials_reserved_not_above_available', 'materials_brand_status_code_idx', 'materials_brand_type_code_idx',
  'boms_total_not_below_material', 'material_code text NOT NULL REFERENCES materials(code)',
  'unit_cost_snapshot numeric(20, 4) NOT NULL CHECK (unit_cost_snapshot > 0)',
  'waste_percent numeric(20, 4) NOT NULL CHECK (waste_percent >= 0 AND waste_percent <= 1000)',
  'PRIMARY KEY (bom_id, line_id)', 'UNIQUE (bom_id, position)', 'boms_brand_status_sku_idx', 'bom_lines_material_code_idx',
  'INSERT INTO outbox_events (id, event_type, aggregate_id, status, event, published_at)', 'FROM catalog_outbox_events',
  'mirror_catalog_outbox_to_unified', 'catalog_outbox_unified_mirror', 'Catalog outbox event conflicts with unified outbox event',
  '-- syntha:migration-mode=online', 'workspace_page_memberships_idx', 'workspace_page_organisations_idx',
  'workspace_page_relationships_brand_idx', 'workspace_page_relationships_shop_idx',
  'workspace_page_invitations_brand_idx', 'workspace_page_invitations_shop_idx',
  'workspace_page_campaigns_brand_idx', 'workspace_page_collections_brand_idx',
  'workspace_page_catalog_brand_idx', 'workspace_page_catalog_collection_idx', 'workspace_page_showrooms_brand_idx',
  'workspace_page_cycles_brand_idx', 'workspace_page_cycles_shop_idx', 'workspace_page_selections_brand_idx', 'workspace_page_selections_shop_idx',
  'workspace_page_orders_brand_idx', 'workspace_page_orders_shop_idx', 'workspace_page_deals_brand_idx', 'workspace_page_deals_shop_idx',
  'workspace_page_calendar_owner_idx',
];
const missing = [];
for (const table of requiredTables) if (!new RegExp(`CREATE TABLE IF NOT EXISTS\\s+${table}\\s*\\(`, 'i').test(sql)) missing.push(`table:${table}`);
for (const fragment of requiredFragments) if (!sql.includes(fragment)) missing.push(`contract:${fragment}`);
if (missing.length) {
  console.error(`PostgreSQL contract is incomplete:\n${missing.map((item) => `- ${item}`).join('\n')}`);
  process.exit(1);
}
console.log(`PostgreSQL contract OK (${requiredTables.length} tables across ${files.length} migrations).`);
