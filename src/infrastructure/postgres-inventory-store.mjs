import { invariant } from '../core/errors.mjs';
import { getRegisteredCommand, insertRegisteredCommand } from './postgres-command-registry.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

export function createPostgresInventoryStore({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function' && typeof pool.query === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({
    transaction: (work) => withPostgresTransaction(pool, work, { createView: view }),
    async getWarehousePositions(shopId, warehouseLocationId, sku = null) {
      const params = [shopId, warehouseLocationId];
      const skuClause = sku ? ' AND sku = $3' : '';
      if (sku) params.push(sku);
      const result = await pool.query(
        `SELECT shop_id, warehouse_location_id, sku,
                sum(on_hand_delta)::bigint AS on_hand_quantity,
                sum(available_delta)::bigint AS available_quantity,
                sum(quarantine_delta)::bigint AS quarantine_quantity,
                count(*)::bigint AS movement_count,
                max(posted_at) AS latest_posted_at
           FROM inventory_movement_ledger_entries
          WHERE shop_id = $1 AND warehouse_location_id = $2${skuClause}
          GROUP BY shop_id, warehouse_location_id, sku
          ORDER BY sku`,
        params,
      );
      return result.rows.map(positionFromRow);
    },
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
    async lockReceipt(id, actorId) {
      const result = await client.query(
        `SELECT receipt.payload
           FROM receipt_snapshots AS receipt
          WHERE receipt.id = $1
            AND EXISTS (
              SELECT 1
                FROM memberships AS membership
               WHERE membership.organisation_id = receipt.shop_id
                 AND membership.user_id = $2
                 AND membership.status = 'active'
            )
          FOR UPDATE OF receipt`,
        [id, actorId],
      );
      return result.rows[0]?.payload;
    },
    async getShipmentNotice(id) {
      const result = await client.query('SELECT payload FROM shipment_notice_snapshots WHERE id = $1 FOR SHARE', [id]);
      return result.rows[0]?.payload;
    },
    async getFulfillmentPlan(id) {
      const result = await client.query('SELECT payload FROM fulfillment_plan_snapshots WHERE id = $1 FOR SHARE', [id]);
      return result.rows[0]?.payload;
    },
    async listMovementsForReceipt(receiptSnapshotId) {
      const result = await client.query(
        'SELECT payload FROM inventory_movement_ledger_entries WHERE receipt_snapshot_id = $1 ORDER BY receipt_line_id, id FOR SHARE',
        [receiptSnapshotId],
      );
      return result.rows.map((row) => row.payload);
    },
    async insertMovement(value) {
      try {
        await client.query(
          `INSERT INTO inventory_movement_ledger_entries
            (id, movement_type, lineage_version, order_id, order_version, order_commit_snapshot_id,
             supply_commitment_snapshot_id, fulfillment_plan_snapshot_id, shipment_notice_snapshot_id,
             receipt_snapshot_id, brand_id, shop_id, warehouse_location_id, receipt_line_id, sku,
             received_quantity, accepted_quantity, damaged_quantity, rejected_quantity,
             on_hand_delta, available_delta, quarantine_delta, occurred_at, posted_at, content_hash, payload)
           VALUES
            ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
             $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26::jsonb)`,
          [
            value.id, value.movementType, value.lineageVersion, value.orderId, value.orderVersion, value.orderCommitSnapshotId,
            value.supplyCommitmentSnapshotId, value.fulfillmentPlanSnapshotId, value.shipmentNoticeSnapshotId,
            value.receiptSnapshotId, value.brandId, value.shopId, value.warehouseLocationId, value.receiptLineId, value.sku,
            value.receivedQuantity, value.acceptedQuantity, value.damagedQuantity, value.rejectedQuantity,
            value.onHandDelta, value.availableDelta, value.quarantineDelta, value.occurredAt, value.postedAt, value.contentHash,
            JSON.stringify(value),
          ],
        );
      } catch (error) {
        if (error?.code === '23505') invariant(false, 'INVENTORY_RECEIPT_ALREADY_POSTED', 'Receipt line is already posted to inventory', { receiptSnapshotId: value.receiptSnapshotId, receiptLineId: value.receiptLineId });
        throw error;
      }
    },
    async getWarehousePositions(shopId, warehouseLocationId, sku = null) {
      const params = [shopId, warehouseLocationId];
      const skuClause = sku ? ' AND sku = $3' : '';
      if (sku) params.push(sku);
      const result = await client.query(
        `SELECT shop_id, warehouse_location_id, sku,
                sum(on_hand_delta)::bigint AS on_hand_quantity,
                sum(available_delta)::bigint AS available_quantity,
                sum(quarantine_delta)::bigint AS quarantine_quantity,
                count(*)::bigint AS movement_count,
                max(posted_at) AS latest_posted_at
           FROM inventory_movement_ledger_entries
          WHERE shop_id = $1 AND warehouse_location_id = $2${skuClause}
          GROUP BY shop_id, warehouse_location_id, sku
          ORDER BY sku`,
        params,
      );
      return result.rows.map(positionFromRow);
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

function positionFromRow(row) {
  const onHandQuantity = safeInteger(row.on_hand_quantity, 'WAREHOUSE_POSITION_ON_HAND_OVERFLOW');
  const availableQuantity = safeInteger(row.available_quantity, 'WAREHOUSE_POSITION_AVAILABLE_OVERFLOW');
  const quarantineQuantity = safeInteger(row.quarantine_quantity, 'WAREHOUSE_POSITION_QUARANTINE_OVERFLOW');
  const movementCount = safeInteger(row.movement_count, 'WAREHOUSE_POSITION_MOVEMENT_COUNT_OVERFLOW');
  invariant(onHandQuantity >= 0 && availableQuantity >= 0 && quarantineQuantity >= 0, 'WAREHOUSE_POSITION_NEGATIVE', 'Warehouse position cannot be negative');
  invariant(availableQuantity + quarantineQuantity <= onHandQuantity, 'WAREHOUSE_POSITION_DISPOSITION_INVALID', 'Available plus quarantine cannot exceed on-hand inventory');
  return Object.freeze({
    shopId: row.shop_id,
    warehouseLocationId: row.warehouse_location_id,
    sku: row.sku,
    onHandQuantity,
    availableQuantity,
    quarantineQuantity,
    movementCount,
    latestPostedAt: new Date(row.latest_posted_at).toISOString(),
  });
}
function safeInteger(value, code) {
  const number = Number(value);
  invariant(Number.isSafeInteger(number), code, 'Warehouse position exceeds safe integer range');
  return number;
}
