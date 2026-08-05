import { invariant } from '../core/errors.mjs';
import { getRegisteredCommand, insertRegisteredCommand } from './postgres-command-registry.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

export function createPostgresProductionExecutionStore({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({ transaction: (work) => withPostgresTransaction(pool, work, { createView: view }) });
}

function view(client) {
  return Object.freeze({
    async getMembership(organisationId, userId) {
      const result = await client.query('SELECT payload FROM memberships WHERE organisation_id = $1 AND user_id = $2 FOR SHARE', [organisationId, userId]);
      return result.rows[0]?.payload;
    },
    async getProductionOrderByNumber(productionOrderNumber) {
      const result = await client.query('SELECT payload FROM production_orders WHERE production_order_number = $1 FOR SHARE', [productionOrderNumber]);
      return result.rows[0]?.payload;
    },
    async getExecutionByCode(executionCode) {
      const result = await client.query('SELECT payload FROM production_executions WHERE execution_code = $1 FOR UPDATE', [executionCode]);
      return result.rows[0]?.payload;
    },
    async getExecutionByProductionOrderNumber(productionOrderNumber) {
      const result = await client.query('SELECT payload FROM production_executions WHERE production_order_number = $1 FOR UPDATE', [productionOrderNumber]);
      return result.rows[0]?.payload;
    },
    async insertExecution(value) {
      try {
        await client.query(
          `INSERT INTO production_executions (
             id, execution_code, production_order_id, production_order_number, production_order_version,
             brand_id, supplier_code, sku, quantity, status, version, production_start_at, delivery_due_at,
             payload, started_at, ready_for_qc_at, cancelled_at, created_at, updated_at
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::timestamptz,$13::timestamptz,$14::jsonb,$15::timestamptz,$16::timestamptz,$17::timestamptz,$18::timestamptz,$19::timestamptz)`,
          parameters(value),
        );
      } catch (error) {
        if (error?.code === '23505') invariant(false, 'PRODUCTION_EXECUTION_ALREADY_EXISTS', 'Production Order already has a production execution calendar', { executionCode: value.executionCode, productionOrderNumber: value.productionOrderNumber });
        throw error;
      }
    },
    async saveExecution(value, expectedVersion) {
      invariant(value.version === expectedVersion + 1, 'VERSION_INCREMENT_INVALID', 'Production execution version must increment exactly once');
      const result = await client.query(
        `UPDATE production_executions
            SET status = $4, version = $5, payload = $6::jsonb,
                started_at = $7::timestamptz, ready_for_qc_at = $8::timestamptz,
                cancelled_at = $9::timestamptz, updated_at = $10::timestamptz
          WHERE id = $1 AND execution_code = $2 AND brand_id = $3 AND version = $11`,
        [value.id, value.executionCode, value.brandId, value.status, value.version, JSON.stringify(value), value.startedAt, value.readyForQcAt, value.cancelledAt, value.updatedAt, expectedVersion],
      );
      invariant(result.rowCount === 1, 'PRODUCTION_EXECUTION_CONCURRENCY_CONFLICT', 'Production execution concurrency conflict', { executionCode: value.executionCode, expectedVersion });
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

function parameters(value) {
  return [value.id,value.executionCode,value.productionOrderId,value.productionOrderNumber,value.productionOrderVersion,value.brandId,value.supplierCode,value.sku,value.quantity,value.status,value.version,value.productionStartAt,value.deliveryDueAt,JSON.stringify(value),value.startedAt,value.readyForQcAt,value.cancelledAt,value.createdAt,value.updatedAt];
}
