import { invariant } from '../core/errors.mjs';
import { getRegisteredCommand, insertRegisteredCommand } from './postgres-command-registry.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

export function createPostgresOrderEconomicsStore({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function' && typeof pool.query === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({
    transaction: (work) => withPostgresTransaction(pool, work, { createView: view }),
    async getSupplyCommitment(id) { return payloadOne(pool, 'SELECT payload FROM supply_commitment_snapshots WHERE id = $1', [id]); },
    async getFxRateSnapshot(id) { return payloadOne(pool, 'SELECT payload FROM order_fx_rate_snapshots WHERE id = $1', [id]); },
    async getActualCostEntry(id) { return payloadOne(pool, 'SELECT payload FROM actual_cost_ledger_entries WHERE id = $1', [id]); },
    async getActualCostReversal(originalEntryId) { return payloadOne(pool, 'SELECT payload FROM actual_cost_ledger_entries WHERE reversal_of_entry_id = $1', [originalEntryId]); },
    async getLandedCostSnapshot(id) { return payloadOne(pool, 'SELECT payload FROM landed_cost_snapshots WHERE id = $1', [id]); },
    async getMarginActualizationSnapshot(id) { return payloadOne(pool, 'SELECT payload FROM margin_actualization_snapshots WHERE id = $1', [id]); },
    async getCostCloseReadinessSnapshot(id) { return payloadOne(pool, 'SELECT payload FROM cost_close_readiness_snapshots WHERE id = $1', [id]); },
    async getCostCloseSnapshot(id) { return payloadOne(pool, 'SELECT payload FROM cost_close_snapshots WHERE id = $1', [id]); },
    async getPostCloseAdjustment(id) { return payloadOne(pool, 'SELECT payload FROM post_close_adjustments WHERE id = $1', [id]); },
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
    async getOrderCommitSnapshot(id) {
      const result = await client.query('SELECT payload FROM order_commit_snapshots WHERE id = $1 FOR SHARE', [id]);
      return result.rows[0]?.payload;
    },
    async insertSupplyCommitment(value) {
      await insertImmutable(client, `INSERT INTO supply_commitment_snapshots
        (id, order_id, order_commit_snapshot_id, lineage_version, brand_id, shop_id, currency, created_at, content_hash, payload)
        VALUES ($1, $2, $3, 2, $4, $5, $6, $7, $8, $9::jsonb)`,
      [value.id, value.orderId, value.orderCommitSnapshotId, value.brandId, value.shopId, value.currency, value.createdAt, value.contentHash, JSON.stringify(value)],
      'SUPPLY_COMMITMENT_ALREADY_EXISTS', { supplyCommitmentId: value.id });
    },
    async getSupplyCommitment(id) {
      const result = await client.query('SELECT payload FROM supply_commitment_snapshots WHERE id = $1 FOR SHARE', [id]);
      return result.rows[0]?.payload;
    },
    async insertFxRateSnapshot(value) {
      await insertImmutable(client, `INSERT INTO order_fx_rate_snapshots
        (id, order_id, order_commit_snapshot_id, source_currency, target_currency, rate, rate_type, source_ref, effective_at, recorded_at, content_hash, payload)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)`,
      [value.id, value.orderId, value.orderCommitSnapshotId, value.sourceCurrency, value.targetCurrency, value.rate, value.rateType, value.sourceRef, value.effectiveAt, value.recordedAt, value.contentHash, JSON.stringify(value)],
      'FX_RATE_SNAPSHOT_ALREADY_EXISTS', { fxRateSnapshotId: value.id });
    },
    async getFxRateSnapshot(id) {
      const result = await client.query('SELECT payload FROM order_fx_rate_snapshots WHERE id = $1 FOR SHARE', [id]);
      return result.rows[0]?.payload;
    },
    async getActualCostEntry(id) {
      const result = await client.query('SELECT payload FROM actual_cost_ledger_entries WHERE id = $1 FOR SHARE', [id]);
      return result.rows[0]?.payload;
    },
    async getActualCostReversal(originalEntryId) {
      const result = await client.query('SELECT payload FROM actual_cost_ledger_entries WHERE reversal_of_entry_id = $1 FOR SHARE', [originalEntryId]);
      return result.rows[0]?.payload;
    },
    async insertActualCostEntry(value) {
      await insertImmutable(client, `INSERT INTO actual_cost_ledger_entries
        (id, order_id, order_commit_snapshot_id, lineage_version, supply_commitment_snapshot_id, brand_id, shop_id,
         entry_kind, reversal_of_entry_id, correction_id, correction_reason, cost_type,
         source_amount, source_currency, fx_rate_snapshot_id, amount, currency, sku, source_ref, occurred_at, recorded_at, payload)
        VALUES ($1, $2, $3, 3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21::jsonb)`,
      [value.id, value.orderId, value.orderCommitSnapshotId, value.supplyCommitmentSnapshotId, value.brandId, value.shopId,
        value.entryKind ?? 'actual', value.reversalOfEntryId ?? null, value.correctionId ?? null, value.correctionReason ?? null, value.costType,
        value.sourceAmount, value.sourceCurrency, value.fxRateSnapshotId, value.amount, value.currency, value.sku, value.sourceRef, value.occurredAt, value.recordedAt, JSON.stringify(value)],
      'ACTUAL_COST_ENTRY_ALREADY_EXISTS', { costEntryId: value.id });
    },
    async listActualCostEntries(orderId) {
      const result = await client.query('SELECT payload FROM actual_cost_ledger_entries WHERE order_id = $1 ORDER BY recorded_at, id FOR SHARE', [orderId]);
      return result.rows.map((row) => row.payload);
    },
    async insertLandedCostSnapshot(value) {
      await insertImmutable(client, `INSERT INTO landed_cost_snapshots
        (id, order_id, order_commit_snapshot_id, lineage_version, currency, total_cost, created_at, content_hash, payload)
        VALUES ($1, $2, $3, 2, $4, $5, $6, $7, $8::jsonb)`,
      [value.id, value.orderId, value.orderCommitSnapshotId, value.currency, value.totalCost, value.createdAt, value.contentHash, JSON.stringify(value)],
      'LANDED_COST_SNAPSHOT_ALREADY_EXISTS', { landedCostSnapshotId: value.id });
    },
    async getLandedCostSnapshot(id) {
      const result = await client.query('SELECT payload FROM landed_cost_snapshots WHERE id = $1 FOR SHARE', [id]);
      return result.rows[0]?.payload;
    },
    async insertMarginActualizationSnapshot(value) {
      await insertImmutable(client, `INSERT INTO margin_actualization_snapshots
        (id, order_id, order_commit_snapshot_id, lineage_version, landed_cost_snapshot_id, currency, net_revenue, landed_cost, contribution_margin_amount, contribution_margin_percent, created_at, content_hash, payload)
        VALUES ($1, $2, $3, 2, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)`,
      [value.id, value.orderId, value.orderCommitSnapshotId, value.landedCostSnapshotId, value.currency, value.netRevenue, value.landedCost, value.contributionMarginAmount, value.contributionMarginPercent, value.createdAt, value.contentHash, JSON.stringify(value)],
      'MARGIN_ACTUALIZATION_ALREADY_EXISTS', { marginActualizationSnapshotId: value.id });
    },
    async getMarginActualizationSnapshot(id) {
      const result = await client.query('SELECT payload FROM margin_actualization_snapshots WHERE id = $1 FOR SHARE', [id]);
      return result.rows[0]?.payload;
    },
    async insertCostCloseReadinessSnapshot(value) {
      await insertImmutable(client, `INSERT INTO cost_close_readiness_snapshots
        (id, order_id, order_commit_snapshot_id, lineage_version, brand_id, shop_id,
         landed_cost_snapshot_id, margin_actualization_snapshot_id, currency, status,
         requirements, blocking_reasons, evaluated_at, content_hash, payload)
        VALUES ($1, $2, $3, 1, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12, $13, $14::jsonb)`,
      [value.id, value.orderId, value.orderCommitSnapshotId, value.brandId, value.shopId,
        value.landedCostSnapshotId, value.marginActualizationSnapshotId, value.currency, value.status,
        JSON.stringify(value.requirements), JSON.stringify(value.blockingReasons), value.evaluatedAt, value.contentHash, JSON.stringify(value)],
      'COST_CLOSE_READINESS_ALREADY_EXISTS', { costCloseReadinessSnapshotId: value.id });
    },
    async getCostCloseReadinessSnapshot(id) {
      const result = await client.query('SELECT payload FROM cost_close_readiness_snapshots WHERE id = $1 FOR SHARE', [id]);
      return result.rows[0]?.payload;
    },
    async getCostCloseSnapshot(id) {
      const result = await client.query('SELECT payload FROM cost_close_snapshots WHERE id = $1 FOR SHARE', [id]);
      return result.rows[0]?.payload;
    },
    async getCostCloseByOrderCommitSnapshotId(orderCommitSnapshotId) {
      const result = await client.query('SELECT payload FROM cost_close_snapshots WHERE order_commit_snapshot_id = $1 FOR SHARE', [orderCommitSnapshotId]);
      return result.rows[0]?.payload;
    },
    async lockCostCloseByOrderCommitSnapshotId(orderCommitSnapshotId) {
      const result = await client.query('SELECT payload FROM cost_close_snapshots WHERE order_commit_snapshot_id = $1 FOR UPDATE', [orderCommitSnapshotId]);
      return result.rows[0]?.payload;
    },
    async insertCostCloseSnapshot(value) {
      await insertImmutable(client, `INSERT INTO cost_close_snapshots
        (id, order_id, order_commit_snapshot_id, lineage_version, brand_id, shop_id,
         landed_cost_snapshot_id, margin_actualization_snapshot_id, cost_close_readiness_snapshot_id,
         currency, total_landed_cost, net_revenue, contribution_margin_amount,
         contribution_margin_percent, closed_at, content_hash, payload)
        VALUES ($1, $2, $3, 2, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb)`,
      [value.id, value.orderId, value.orderCommitSnapshotId, value.brandId, value.shopId,
        value.landedCostSnapshotId, value.marginActualizationSnapshotId, value.costCloseReadinessSnapshotId,
        value.currency, value.totalLandedCost, value.netRevenue, value.contributionMarginAmount,
        value.contributionMarginPercent, value.closedAt, value.contentHash, JSON.stringify(value)],
      'COST_CLOSE_ALREADY_EXISTS', { costCloseSnapshotId: value.id, orderCommitSnapshotId: value.orderCommitSnapshotId });
    },
    async getLatestPostCloseAdjustment(costCloseSnapshotId) {
      const result = await client.query(
        'SELECT payload FROM post_close_adjustments WHERE cost_close_snapshot_id = $1 ORDER BY recorded_at DESC, id DESC LIMIT 1 FOR SHARE',
        [costCloseSnapshotId],
      );
      return result.rows[0]?.payload;
    },
    async insertPostCloseAdjustment(value) {
      await insertImmutable(client, `INSERT INTO post_close_adjustments
        (id, cost_close_snapshot_id, previous_adjustment_id, order_id, order_commit_snapshot_id,
         actual_cost_entry_id, prior_landed_cost_snapshot_id, landed_cost_snapshot_id,
         prior_margin_actualization_snapshot_id, margin_actualization_snapshot_id,
         cost_delta_amount, margin_delta_amount, reason, recorded_at, content_hash, payload)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb)`,
      [value.id, value.costCloseSnapshotId, value.previousAdjustmentId, value.orderId, value.orderCommitSnapshotId,
        value.actualCostEntryId, value.priorLandedCostSnapshotId, value.landedCostSnapshotId,
        value.priorMarginActualizationSnapshotId, value.marginActualizationSnapshotId,
        value.costDeltaAmount, value.marginDeltaAmount, value.reason, value.recordedAt, value.contentHash, JSON.stringify(value)],
      'POST_CLOSE_ADJUSTMENT_ALREADY_EXISTS', { postCloseAdjustmentId: value.id });
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
