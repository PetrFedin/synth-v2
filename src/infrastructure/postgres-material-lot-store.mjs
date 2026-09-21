import { invariant } from '../core/errors.mjs';
import { getRegisteredCommand, insertRegisteredCommand } from './postgres-command-registry.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

export function createPostgresMaterialLotStore({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({ transaction: (work) => withPostgresTransaction(pool, work, { createView: view }) });
}

function view(client) {
  return Object.freeze({
    async getMembership(organisationId, userId) {
      const result = await client.query('SELECT payload FROM memberships WHERE organisation_id = $1 AND user_id = $2 FOR SHARE', [organisationId, userId]);
      return result.rows[0]?.payload;
    },
    async getMaterialByCode(code) {
      const result = await client.query('SELECT payload FROM materials WHERE code = $1 FOR SHARE', [code]);
      return result.rows[0]?.payload;
    },
    async getExecutionByCode(executionCode) {
      const result = await client.query('SELECT payload FROM production_executions WHERE execution_code = $1 FOR SHARE', [executionCode]);
      return result.rows[0]?.payload;
    },
    async getLotById(lotId) {
      const result = await client.query('SELECT payload FROM material_lots WHERE id = $1 FOR UPDATE', [lotId]);
      return result.rows[0]?.payload;
    },
    async getIssue(lotId, executionId) {
      const result = await client.query('SELECT payload FROM material_lot_issues WHERE lot_id = $1 AND execution_id = $2 FOR UPDATE', [lotId, executionId]);
      return result.rows[0]?.payload;
    },
    async insertLot(value) {
      try {
        await client.query(
          `INSERT INTO material_lots (id,brand_id,material_code,material_version,lot_reference,dye_lot,supplier_code,unit,received_quantity,issued_quantity,status,received_at,certificate_reference,notes,version,created_at,created_by,updated_at,payload)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::timestamptz,$13,$14,$15,$16::timestamptz,$17,$18::timestamptz,$19::jsonb)`,
          [value.id, value.brandId, value.materialCode, value.materialVersion, value.lotReference, value.dyeLot, value.supplierCode, value.unit,
            value.receivedQuantity, value.issuedQuantity, value.status, value.receivedAt, value.certificateReference, value.notes,
            value.version, value.createdAt, value.createdBy, value.updatedAt, JSON.stringify(value)],
        );
      } catch (error) {
        if (error?.code === '23505') invariant(false, 'MATERIAL_LOT_ALREADY_RECEIVED', 'This lot reference is already recorded for this material', { materialCode: value.materialCode, lotReference: value.lotReference });
        throw error;
      }
    },
    async saveLot(value, expectedVersion) {
      invariant(value.version === expectedVersion + 1, 'VERSION_INCREMENT_INVALID', 'Material lot version must increment exactly once');
      // `issued_quantity` намеренно не пишется отсюда: его ведёт триггер по выдачам, и переписать
      // его руками значило бы завести второе мнение о том, сколько уже в ткани.
      const result = await client.query(
        `UPDATE material_lots
            SET status = $3, certificate_reference = $4, notes = $5, version = $6, updated_at = $7::timestamptz,
                payload = $8::jsonb || jsonb_build_object('issuedQuantity', issued_quantity)
          WHERE id = $1 AND version = $2`,
        [value.id, expectedVersion, value.status, value.certificateReference, value.notes, value.version, value.updatedAt, JSON.stringify(value)],
      );
      invariant(result.rowCount === 1, 'MATERIAL_LOT_CONCURRENCY_CONFLICT', 'This material lot was changed by another operation', { lotReference: value.lotReference, expectedVersion });
    },
    async upsertIssue(id, issue) {
      await client.query(
        `INSERT INTO material_lot_issues (id,lot_id,execution_id,execution_code,quantity,issued_at,issued_by,notes,payload)
         VALUES ($1,$2,$3,$4,$5,$6::timestamptz,$7,$8,$9::jsonb)
         ON CONFLICT (lot_id, execution_id) DO UPDATE
            SET quantity = EXCLUDED.quantity, issued_at = EXCLUDED.issued_at, issued_by = EXCLUDED.issued_by,
                notes = EXCLUDED.notes, payload = EXCLUDED.payload`,
        [id, issue.lotId, issue.executionId, issue.executionCode, issue.quantity, issue.issuedAt, issue.issuedBy, issue.notes, JSON.stringify(issue)],
      );
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
