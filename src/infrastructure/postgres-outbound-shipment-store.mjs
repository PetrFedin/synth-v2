import { invariant } from '../core/errors.mjs';
import { getRegisteredCommand, insertRegisteredCommand } from './postgres-command-registry.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

export function createPostgresOutboundShipmentStore({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({ transaction: (work) => withPostgresTransaction(pool, work, { createView: view }) });
}

function view(client) {
  return Object.freeze({
    async getMembership(organisationId, userId) {
      const result = await client.query('SELECT payload FROM memberships WHERE organisation_id = $1 AND user_id = $2 FOR SHARE', [organisationId, userId]);
      return result.rows[0]?.payload;
    },
    async getReleaseByCode(releaseCode) {
      const result = await client.query(
        `SELECT id, release_code, inspection_code, inspection_version, execution_code, production_order_number,
                brand_id, supplier_code, sku, quantity, run_number, released_at, released_by, payload
           FROM quality_shipment_releases
          WHERE release_code = $1
          FOR SHARE`,
        [releaseCode],
      );
      const row = result.rows[0];
      return row ? Object.freeze({
        id: row.id,
        releaseCode: row.release_code,
        inspectionCode: row.inspection_code,
        inspectionVersion: row.inspection_version,
        executionCode: row.execution_code,
        productionOrderNumber: row.production_order_number,
        brandId: row.brand_id,
        supplierCode: row.supplier_code,
        sku: row.sku,
        quantity: row.quantity,
        runNumber: row.run_number,
        releasedAt: row.released_at instanceof Date ? row.released_at.toISOString() : row.released_at,
        releasedBy: row.released_by,
        notes: row.payload?.notes ?? null,
      }) : null;
    },
    async getShipmentByCode(shipmentCode) {
      const result = await client.query('SELECT payload FROM outbound_shipments WHERE shipment_code = $1 FOR UPDATE', [shipmentCode]);
      return result.rows[0]?.payload;
    },
    async getShipmentByReleaseCode(releaseCode) {
      const result = await client.query('SELECT payload FROM outbound_shipments WHERE release_code = $1 FOR UPDATE', [releaseCode]);
      return result.rows[0]?.payload;
    },
    async insertShipment(value) {
      try {
        await client.query(
          `INSERT INTO outbound_shipments (
             id,shipment_code,release_id,release_code,inspection_code,inspection_version,execution_code,
             production_order_number,brand_id,supplier_code,sku,quantity,status,version,payload,
             booked_at,ready_at,dispatched_at,tracking_number,cancelled_at,created_at,updated_at
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16::timestamptz,$17::timestamptz,$18::timestamptz,$19,$20::timestamptz,$21::timestamptz,$22::timestamptz)`,
          shipmentParameters(value),
        );
      } catch (error) {
        if (error?.code === '23505') invariant(false, 'SHIPMENT_ALREADY_EXISTS', 'Final Quality release already has an outbound shipment', { shipmentCode: value.shipmentCode, releaseCode: value.releaseCode });
        throw error;
      }
    },
    async saveShipment(value, expectedVersion) {
      invariant(value.version === expectedVersion + 1, 'VERSION_INCREMENT_INVALID', 'Outbound Shipment version must increment exactly once');
      const result = await client.query(
        `UPDATE outbound_shipments
            SET status = $4, version = $5, payload = $6::jsonb,
                booked_at = $7::timestamptz, ready_at = $8::timestamptz,
                dispatched_at = $9::timestamptz, tracking_number = $10,
                cancelled_at = $11::timestamptz, updated_at = $12::timestamptz
          WHERE id = $1 AND shipment_code = $2 AND brand_id = $3 AND version = $13`,
        [
          value.id, value.shipmentCode, value.brandId, value.status, value.version, JSON.stringify(value),
          value.booking?.bookedAt ?? null, value.readyAt, value.dispatch?.dispatchedAt ?? null,
          value.dispatch?.trackingNumber ?? null, value.cancelledAt, value.updatedAt, expectedVersion,
        ],
      );
      invariant(result.rowCount === 1, 'SHIPMENT_CONCURRENCY_CONFLICT', 'Outbound Shipment concurrency conflict', { shipmentCode: value.shipmentCode, expectedVersion });
    },
    getCommand: (id) => getRegisteredCommand(client, 'catalog', id),
    insertCommand: (value) => insertRegisteredCommand(client, 'catalog', value),
    async appendOutbox(event) {
      try {
        await client.query("INSERT INTO outbox_events (id,event_type,aggregate_id,status,event,published_at) VALUES ($1,$2,$3,'pending',$4::jsonb,NULL)", [event.id, event.type, event.aggregateId, JSON.stringify(event)]);
      } catch (error) {
        if (error?.code === '23505') invariant(false, 'OUTBOX_EVENT_ALREADY_EXISTS', 'Outbox event already exists', { eventId: event.id });
        throw error;
      }
    },
  });
}

function shipmentParameters(value) {
  return [
    value.id, value.shipmentCode, value.releaseId, value.releaseCode, value.inspectionCode, value.inspectionVersion,
    value.executionCode, value.productionOrderNumber, value.brandId, value.supplierCode, value.sku, value.quantity,
    value.status, value.version, JSON.stringify(value), value.booking?.bookedAt ?? null, value.readyAt,
    value.dispatch?.dispatchedAt ?? null, value.dispatch?.trackingNumber ?? null, value.cancelledAt,
    value.createdAt, value.updatedAt,
  ];
}
