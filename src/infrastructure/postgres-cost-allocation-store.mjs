import { invariant } from '../core/errors.mjs';
import { getRegisteredCommand, insertRegisteredCommand } from './postgres-command-registry.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

export function createPostgresCostAllocationStore({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function' && typeof pool.query === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({
    transaction: (work) => withPostgresTransaction(pool, work, { createView }),
    async getPolicyVersion(id) { return payloadOne(pool, 'SELECT payload FROM cost_allocation_policy_versions WHERE id = $1', [id]); },
    async getAllocationRun(id) { return payloadOne(pool, 'SELECT payload FROM cost_allocation_run_snapshots WHERE id = $1', [id]); },
  });
}

function createView(client) {
  return Object.freeze({
    async getMembership(organisationId, userId) {
      const result = await client.query('SELECT payload FROM memberships WHERE organisation_id = $1 AND user_id = $2 FOR SHARE', [organisationId, userId]);
      return result.rows[0]?.payload;
    },
    async getOrder(id) {
      const result = await client.query('SELECT payload FROM orders WHERE id = $1 FOR SHARE', [id]);
      return result.rows[0]?.payload;
    },
    async getOrderCommitSnapshot(id) {
      const result = await client.query('SELECT payload FROM order_commit_snapshots WHERE id = $1 FOR SHARE', [id]);
      return result.rows[0]?.payload;
    },
    async getLandedCostSnapshot(id) {
      const result = await client.query('SELECT payload FROM landed_cost_snapshots WHERE id = $1 FOR SHARE', [id]);
      return result.rows[0]?.payload;
    },
    async listActualCostEntries(orderId) {
      const result = await client.query('SELECT payload FROM actual_cost_ledger_entries WHERE order_id = $1 ORDER BY recorded_at, id FOR SHARE', [orderId]);
      return result.rows.map((row) => row.payload);
    },
    async getPolicyVersion(id) {
      const result = await client.query('SELECT payload FROM cost_allocation_policy_versions WHERE id = $1 FOR SHARE', [id]);
      return result.rows[0]?.payload;
    },
    async insertPolicyVersion(value) {
      await insertImmutable(client, `INSERT INTO cost_allocation_policy_versions
        (id, brand_id, name, version, default_basis, rules, status, created_at, content_hash, payload)
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10::jsonb)`,
      [value.id, value.brandId, value.name, value.version, value.defaultBasis, JSON.stringify(value.rules), value.status, value.createdAt, value.contentHash, JSON.stringify(value)],
      'COST_ALLOCATION_POLICY_ALREADY_EXISTS', { policyVersionId: value.id });
    },
    async insertAllocationRun(value) {
      await insertImmutable(client, `INSERT INTO cost_allocation_run_snapshots
        (id, order_id, order_commit_snapshot_id, landed_cost_snapshot_id, policy_version_id, brand_id, shop_id,
         currency, cost_entry_ids, allocations, sku_economics, allocated_total, status, created_at, content_hash, payload)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb, $12, $13, $14, $15, $16::jsonb)`,
      [value.id, value.orderId, value.orderCommitSnapshotId, value.landedCostSnapshotId, value.policyVersionId, value.brandId, value.shopId,
        value.currency, JSON.stringify(value.costEntryIds), JSON.stringify(value.allocations), JSON.stringify(value.skuEconomics), value.allocatedTotal,
        value.status, value.createdAt, value.contentHash, JSON.stringify(value)],
      'COST_ALLOCATION_RUN_ALREADY_EXISTS', { allocationRunId: value.id });
    },
    async getAllocationRun(id) {
      const result = await client.query('SELECT payload FROM cost_allocation_run_snapshots WHERE id = $1 FOR SHARE', [id]);
      return result.rows[0]?.payload;
    },
    getCommand: (id) => getRegisteredCommand(client, 'wholesale', id),
    insertCommand: (value) => insertRegisteredCommand(client, 'wholesale', value),
    async appendOutbox(event) {
      try {
        await client.query(
          `INSERT INTO outbox_events (id, event_type, aggregate_id, status, event, published_at)
           VALUES ($1, $2, $3, 'pending', $4::jsonb, NULL)`,
          [event.id, event.type, event.aggregateId, JSON.stringify(event)],
        );
      } catch (error) {
        if (error?.code === '23505') invariant(false, 'OUTBOX_EVENT_ALREADY_EXISTS', 'Outbox event already exists', { eventId: event.id });
        throw error;
      }
    },
  });
}

async function insertImmutable(client, sql, values, code, details) {
  try { await client.query(sql, values); }
  catch (error) {
    if (error?.code === '23505') invariant(false, code, 'Immutable cost allocation record already exists', details);
    throw error;
  }
}

async function payloadOne(pool, sql, values) {
  const result = await pool.query(sql, values);
  return result.rows[0]?.payload;
}
