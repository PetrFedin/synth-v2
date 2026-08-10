import { invariant } from '../core/errors.mjs';
import { getRegisteredCommand, insertRegisteredCommand } from './postgres-command-registry.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

export function createPostgresFulfillmentStore({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function' && typeof pool.query === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({
    transaction: (work) => withPostgresTransaction(pool, work, { createView: view }),
    getFulfillmentPlan: (id) => payloadOne(pool, 'SELECT payload FROM fulfillment_plan_snapshots WHERE id = $1', [id]),
    getShipmentNotice: (id) => payloadOne(pool, 'SELECT payload FROM shipment_notice_snapshots WHERE id = $1', [id]),
    getReceipt: (id) => payloadOne(pool, 'SELECT payload FROM receipt_snapshots WHERE id = $1', [id]),
    getReceiptDiscrepancy: (id) => payloadOne(pool, 'SELECT payload FROM receipt_discrepancy_snapshots WHERE id = $1', [id]),
  });
}

function view(client) {
  return Object.freeze({
    async getMembership(organisationId, userId) {
      const result = await client.query(
        'SELECT payload FROM memberships WHERE organisation_id = $1 AND user_id = $2 FOR SHARE',
        [organisationId, userId],
      );
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
    async getSupplyCommitment(id) {
      const result = await client.query('SELECT payload FROM supply_commitment_snapshots WHERE id = $1 FOR SHARE', [id]);
      return result.rows[0]?.payload;
    },
    async getFxRateSnapshot(id) {
      const result = await client.query('SELECT payload FROM order_fx_rate_snapshots WHERE id = $1 FOR SHARE', [id]);
      return result.rows[0]?.payload;
    },
    async getCostCloseByOrderCommitSnapshotId(orderCommitSnapshotId) {
      const result = await client.query('SELECT payload FROM cost_close_snapshots WHERE order_commit_snapshot_id = $1 FOR SHARE', [orderCommitSnapshotId]);
      return result.rows[0]?.payload;
    },
    async lockOrderCostLedger(orderCommitSnapshotId) {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [orderCommitSnapshotId]);
    },
    async lockActualCostEntry(id) {
      const result = await client.query('SELECT payload FROM actual_cost_ledger_entries WHERE id = $1 FOR UPDATE', [id]);
      return result.rows[0]?.payload;
    },
    async getActualCostReversal(originalEntryId) {
      const result = await client.query(
        'SELECT payload FROM actual_cost_ledger_entries WHERE reversal_of_entry_id = $1 ORDER BY recorded_at, id LIMIT 1 FOR SHARE',
        [originalEntryId],
      );
      return result.rows[0]?.payload;
    },
    async listReservations(orderId) {
      const result = await client.query(
        `SELECT order_id, sku, quantity, order_commit_snapshot_id, lineage_version
           FROM order_inventory_reservations
          WHERE order_id = $1
          ORDER BY sku
          FOR SHARE`,
        [orderId],
      );
      return result.rows.map((row) => Object.freeze({
        orderId: row.order_id,
        sku: row.sku,
        quantity: row.quantity,
        orderCommitSnapshotId: row.order_commit_snapshot_id,
        lineageVersion: row.lineage_version,
      }));
    },
    async insertFulfillmentPlan(value) {
      await insertImmutable(client, `INSERT INTO fulfillment_plan_snapshots
        (id, order_id, order_commit_snapshot_id, supply_commitment_snapshot_id, brand_id, shop_id,
         currency, ship_from, ship_to, planned_ship_at, expected_delivery_at, lines,
         status, created_at, content_hash, payload)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11, $12::jsonb, $13, $14, $15, $16::jsonb)`,
      [value.id, value.orderId, value.orderCommitSnapshotId, value.supplyCommitmentSnapshotId, value.brandId, value.shopId,
        value.currency, JSON.stringify(value.shipFrom), JSON.stringify(value.shipTo), value.plannedShipAt, value.expectedDeliveryAt,
        JSON.stringify(value.lines), value.status, value.createdAt, value.contentHash, JSON.stringify(value)],
      'FULFILLMENT_PLAN_ALREADY_EXISTS', { fulfillmentPlanId: value.id });
    },
    async getFulfillmentPlan(id) {
      const result = await client.query('SELECT payload FROM fulfillment_plan_snapshots WHERE id = $1 FOR SHARE', [id]);
      return result.rows[0]?.payload;
    },
    async listShipmentNotices(fulfillmentPlanId) {
      const result = await client.query(
        'SELECT payload FROM shipment_notice_snapshots WHERE fulfillment_plan_snapshot_id = $1 ORDER BY shipped_at, id FOR SHARE',
        [fulfillmentPlanId],
      );
      return result.rows.map((row) => row.payload);
    },
    async insertShipmentNotice(value) {
      await insertImmutable(client, `INSERT INTO shipment_notice_snapshots
        (id, order_id, order_commit_snapshot_id, supply_commitment_snapshot_id, fulfillment_plan_snapshot_id,
         brand_id, shop_id, shipment_number, carrier, service_level, tracking_number,
         shipped_at, expected_delivery_at, lines, status, created_at, content_hash, payload)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15, $16, $17, $18::jsonb)`,
      [value.id, value.orderId, value.orderCommitSnapshotId, value.supplyCommitmentSnapshotId, value.fulfillmentPlanSnapshotId,
        value.brandId, value.shopId, value.shipmentNumber, value.carrier, value.serviceLevel, value.trackingNumber,
        value.shippedAt, value.expectedDeliveryAt, JSON.stringify(value.lines), value.status, value.createdAt, value.contentHash, JSON.stringify(value)],
      'SHIPMENT_NOTICE_ALREADY_EXISTS', { shipmentNoticeId: value.id });
    },
    async getShipmentNotice(id) {
      const result = await client.query('SELECT payload FROM shipment_notice_snapshots WHERE id = $1 FOR SHARE', [id]);
      return result.rows[0]?.payload;
    },
    async listReceipts(shipmentNoticeId) {
      const result = await client.query(
        'SELECT payload FROM receipt_snapshots WHERE shipment_notice_snapshot_id = $1 ORDER BY received_at, id FOR SHARE',
        [shipmentNoticeId],
      );
      return result.rows.map((row) => row.payload);
    },
    async insertReceipt(value) {
      await insertImmutable(client, `INSERT INTO receipt_snapshots
        (id, order_id, order_commit_snapshot_id, supply_commitment_snapshot_id, fulfillment_plan_snapshot_id,
         shipment_notice_snapshot_id, brand_id, shop_id, receipt_reference, received_by,
         receipt_complete, received_at, lines, status, created_at, content_hash, payload)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14, $15, $16, $17::jsonb)`,
      [value.id, value.orderId, value.orderCommitSnapshotId, value.supplyCommitmentSnapshotId, value.fulfillmentPlanSnapshotId,
        value.shipmentNoticeSnapshotId, value.brandId, value.shopId, value.receiptReference, value.receivedBy,
        value.receiptComplete, value.receivedAt, JSON.stringify(value.lines), value.status, value.createdAt, value.contentHash, JSON.stringify(value)],
      'RECEIPT_ALREADY_EXISTS', { receiptId: value.id });
    },
    async getReceipt(id) {
      const result = await client.query('SELECT payload FROM receipt_snapshots WHERE id = $1 FOR SHARE', [id]);
      return result.rows[0]?.payload;
    },
    async insertReceiptDiscrepancy(value) {
      await insertImmutable(client, `INSERT INTO receipt_discrepancy_snapshots
        (id, order_id, order_commit_snapshot_id, supply_commitment_snapshot_id, fulfillment_plan_snapshot_id,
         shipment_notice_snapshot_id, latest_receipt_snapshot_id, brand_id, shop_id, receipt_snapshot_ids,
         finalized, lines, issue_count, status, created_at, content_hash, payload)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12::jsonb, $13, $14, $15, $16, $17::jsonb)`,
      [value.id, value.orderId, value.orderCommitSnapshotId, value.supplyCommitmentSnapshotId, value.fulfillmentPlanSnapshotId,
        value.shipmentNoticeSnapshotId, value.latestReceiptSnapshotId, value.brandId, value.shopId, JSON.stringify(value.receiptSnapshotIds),
        value.finalized, JSON.stringify(value.lines), value.issueCount, value.status, value.createdAt, value.contentHash, JSON.stringify(value)],
      'RECEIPT_DISCREPANCY_ALREADY_EXISTS', { discrepancyId: value.id });
    },
    async getReceiptDiscrepancy(id) {
      const result = await client.query('SELECT payload FROM receipt_discrepancy_snapshots WHERE id = $1 FOR SHARE', [id]);
      return result.rows[0]?.payload;
    },
    async insertPhysicalActualCostEntry(value) {
      await insertImmutable(client, `INSERT INTO actual_cost_ledger_entries
        (id, order_id, order_commit_snapshot_id, lineage_version, supply_commitment_snapshot_id,
         physical_lineage_version, fulfillment_plan_snapshot_id, shipment_notice_snapshot_id,
         receipt_snapshot_id, receipt_discrepancy_snapshot_id, brand_id, shop_id,
         entry_kind, reversal_of_entry_id, correction_id, correction_reason, cost_type,
         source_amount, source_currency, fx_rate_snapshot_id, amount, currency, sku, source_ref, occurred_at, recorded_at, payload)
        VALUES ($1, $2, $3, 3, $4, 2, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25::jsonb)`,
      [value.id, value.orderId, value.orderCommitSnapshotId, value.supplyCommitmentSnapshotId,
        value.fulfillmentPlanSnapshotId, value.shipmentNoticeSnapshotId, value.receiptSnapshotId, value.receiptDiscrepancySnapshotId,
        value.brandId, value.shopId, value.entryKind ?? 'actual', value.reversalOfEntryId ?? null, value.correctionId ?? null,
        value.correctionReason ?? null, value.costType, value.sourceAmount, value.sourceCurrency, value.fxRateSnapshotId,
        value.amount, value.currency, value.sku, value.sourceRef, value.occurredAt, value.recordedAt, JSON.stringify(value)],
      'ACTUAL_COST_ENTRY_ALREADY_EXISTS', { costEntryId: value.id });
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
    if (error?.code === '23505') invariant(false, code, 'Immutable fulfillment record already exists', details);
    throw error;
  }
}
async function payloadOne(pool, sql, values) {
  const result = await pool.query(sql, values);
  return result.rows[0]?.payload;
}
