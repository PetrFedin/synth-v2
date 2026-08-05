import { invariant } from '../core/errors.mjs';
import { getRegisteredCommand, insertRegisteredCommand } from './postgres-command-registry.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

export function createPostgresFinalQualityStore({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({ transaction: (work) => withPostgresTransaction(pool, work, { createView: view }) });
}

function view(client) {
  return Object.freeze({
    async getMembership(organisationId, userId) {
      const result = await client.query('SELECT payload FROM memberships WHERE organisation_id = $1 AND user_id = $2 FOR SHARE', [organisationId, userId]);
      return result.rows[0]?.payload;
    },
    async getExecutionByCode(executionCode) {
      const result = await client.query('SELECT payload FROM production_executions WHERE execution_code = $1 FOR SHARE', [executionCode]);
      return result.rows[0]?.payload;
    },
    async getInspectionByCode(inspectionCode) {
      const result = await client.query('SELECT payload FROM quality_inspections WHERE inspection_code = $1 FOR UPDATE', [inspectionCode]);
      return result.rows[0]?.payload;
    },
    async getInspectionByExecutionCode(executionCode) {
      const result = await client.query('SELECT payload FROM quality_inspections WHERE execution_code = $1 FOR UPDATE', [executionCode]);
      return result.rows[0]?.payload;
    },
    async insertInspection(value) {
      try {
        await client.query(
          `INSERT INTO quality_inspections (
             id,inspection_code,execution_id,execution_code,execution_version,production_order_number,
             production_order_version,brand_id,supplier_code,sku,quantity,status,version,current_run,payload,
             released_at,rejected_at,cancelled_at,created_at,updated_at
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16::timestamptz,$17::timestamptz,$18::timestamptz,$19::timestamptz,$20::timestamptz)`,
          inspectionParameters(value),
        );
      } catch (error) {
        if (error?.code === '23505') invariant(false, 'QUALITY_INSPECTION_ALREADY_EXISTS', 'Production execution already has a Final Quality inspection', { inspectionCode: value.inspectionCode, executionCode: value.executionCode });
        throw error;
      }
    },
    async saveInspection(value, expectedVersion) {
      invariant(value.version === expectedVersion + 1, 'VERSION_INCREMENT_INVALID', 'Final Quality version must increment exactly once');
      const result = await client.query(
        `UPDATE quality_inspections
            SET status = $4, version = $5, current_run = $6, payload = $7::jsonb,
                released_at = $8::timestamptz, rejected_at = $9::timestamptz,
                cancelled_at = $10::timestamptz, updated_at = $11::timestamptz
          WHERE id = $1 AND inspection_code = $2 AND brand_id = $3 AND version = $12`,
        [
          value.id, value.inspectionCode, value.brandId, value.status, value.version, value.currentRun,
          JSON.stringify(value), value.shipmentRelease?.releasedAt ?? null, value.rejection?.rejectedAt ?? null,
          value.cancelledAt, value.updatedAt, expectedVersion,
        ],
      );
      invariant(result.rowCount === 1, 'QUALITY_CONCURRENCY_CONFLICT', 'Final Quality concurrency conflict', { inspectionCode: value.inspectionCode, expectedVersion });
    },
    async insertShipmentRelease(value) {
      try {
        await client.query(
          `INSERT INTO quality_shipment_releases (
             id,release_code,inspection_id,inspection_code,inspection_version,execution_code,production_order_number,
             brand_id,supplier_code,sku,quantity,run_number,payload,released_at,released_by,created_at
           )
           SELECT $1,$2,inspection.id,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::timestamptz,$14,$15::timestamptz
             FROM quality_inspections AS inspection
            WHERE inspection.inspection_code = $3`,
          [
            value.id, value.releaseCode, value.inspectionCode, value.inspectionVersion, value.executionCode,
            value.productionOrderNumber, value.brandId, value.supplierCode, value.sku, value.quantity,
            value.runNumber, JSON.stringify(releasePayload(value)), value.releasedAt, value.releasedBy, value.createdAt,
          ],
        );
      } catch (error) {
        if (error?.code === '23505') invariant(false, 'QUALITY_SHIPMENT_RELEASE_EXISTS', 'Shipment release already exists', { releaseCode: value.releaseCode, inspectionCode: value.inspectionCode });
        throw error;
      }
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

function inspectionParameters(value) {
  return [
    value.id, value.inspectionCode, value.executionId, value.executionCode, value.executionVersion,
    value.productionOrderNumber, value.productionOrderVersion, value.brandId, value.supplierCode, value.sku,
    value.quantity, value.status, value.version, value.currentRun, JSON.stringify(value),
    value.shipmentRelease?.releasedAt ?? null, value.rejection?.rejectedAt ?? null, value.cancelledAt,
    value.createdAt, value.updatedAt,
  ];
}
function releasePayload(value) {
  return {
    releaseCode: value.releaseCode,
    inspectionCode: value.inspectionCode,
    inspectionVersion: value.inspectionVersion,
    executionCode: value.executionCode,
    productionOrderNumber: value.productionOrderNumber,
    supplierCode: value.supplierCode,
    sku: value.sku,
    quantity: value.quantity,
    runNumber: value.runNumber,
    releasedAt: value.releasedAt,
    releasedBy: value.releasedBy,
    notes: value.notes,
  };
}
