import { invariant } from '../core/errors.mjs';
import { getRegisteredCommand, insertRegisteredCommand } from './postgres-command-registry.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

export function createPostgresOrderEconomicsStore({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function' && typeof pool.query === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({
    transaction: (work) => withPostgresTransaction(pool, work, { createView: view }),
    async getSupplyCommitment(id) { return payloadOne(pool, 'SELECT payload FROM supply_commitment_snapshots WHERE id = $1', [id]); },
    async getLandedCostSnapshot(id) { return payloadOne(pool, 'SELECT payload FROM landed_cost_snapshots WHERE id = $1', [id]); },
    async getMarginActualizationSnapshot(id) { return payloadOne(pool, 'SELECT payload FROM margin_actualization_snapshots WHERE id = $1', [id]); },
    async listActualCostEntries(orderId) {
      const result = await pool.query('SELECT payload FROM actual_cost_ledger_entries WHERE order_id = $1 ORDER BY recorded_at, id', [orderId]);
      return result.rows.map((row) => row.payload);
    },
  });
}

function view(client) {
  return Object.freeze({
    async getMembership(organisationId, userId) {
      const result = await client.query('SELECT payload FROM memberships WHERE organisation_id = $1 AND user_id = $2 FOR SHARE', [organisationId, userId]);
      return result.rows[0]?.payload;
    },
    async getOrder(id) {
      const result = await client.query('SELECT payload FROM orders WHERE id = $1 FOR SHARE', [id]);
      return result.rows[0]?.payload;
    },
    async insertSupplyCommitment(value) {
      await insertImmutable(client, `INSERT INTO supply_commitment_snapshots
        (id, order_id, brand_id, shop_id, currency, created_at, content_hash, payload)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
      [value.id, value.orderId, value.brandId, value.shopId, value.currency, value.createdAt, value.contentHash, JSON.stringify(value)],
      'SUPPLY_COMMITMENT_ALREADY_EXISTS', { supplyCommitmentId: value.id });
    },
    async insertActualCostEntry(value) {
      await insertImmutable(client, `INSERT INTO actual_cost_ledger_entries
        (id, order_id, brand_id, shop_id, cost_type, amount, currency, sku, source_ref, occurred_at, recorded_at, payload)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)`,
      [value.id, value.orderId, value.brandId, value.shopId, value.costType, value.amount, value.currency, value.sku, value.sourceRef, value.occurredAt, value.recordedAt, JSON.stringify(value)],
      'ACTUAL_COST_ENTRY_ALREADY_EXISTS', { costEntryId: value.id });
    },
    async listActualCostEntries(orderId) {
      const result = await client.query('SELECT payload FROM actual_cost_ledger_entries WHERE order_id = $1 ORDER BY recorded_at, id FOR SHARE', [orderId]);
      return result.rows.map((row) => row.payload);
    },
    async insertLandedCostSnapshot(value) {
      await insertImmutable(client, `INSERT INTO landed_cost_snapshots
        (id, order_id, currency, total_cost, created_at, content_hash, payload)
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [value.id, value.orderId, value.currency, value.totalCost, value.createdAt, value.contentHash, JSON.stringify(value)],
      'LANDED_COST_SNAPSHOT_ALREADY_EXISTS', { landedCostSnapshotId: value.id });
    },
    async getLandedCostSnapshot(id) {
      const result = await client.query('SELECT payload FROM landed_cost_snapshots WHERE id = $1 FOR SHARE', [id]);
      return result.rows[0]?.payload;
    },
    async insertMarginActualizationSnapshot(value) {
      await insertImmutable(client, `INSERT INTO margin_actualization_snapshots
        (id, order_id, landed_cost_snapshot_id, currency, net_revenue, landed_cost, contribution_margin_amount, contribution_margin_percent, created_at, content_hash, payload)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)`,
      [value.id, value.orderId, value.landedCostSnapshotId, value.currency, value.netRevenue, value.landedCost, value.contributionMarginAmount, value.contributionMarginPercent, value.createdAt, value.contentHash, JSON.stringify(value)],
      'MARGIN_ACTUALIZATION_ALREADY_EXISTS', { marginActualizationSnapshotId: value.id });
    },
    async getMarginActualizationSnapshot(id) {
      const result = await client.query('SELECT payload FROM margin_actualization_snapshots WHERE id = $1 FOR SHARE', [id]);
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
    if (error?.code === '23505') invariant(false, code, 'Immutable order economics record already exists', details);
    throw error;
  }
}
async function payloadOne(pool, sql, values) {
  const result = await pool.query(sql, values);
  return result.rows[0]?.payload;
}
