import { invariant } from '../core/errors.mjs';
import { getRegisteredCommand, insertRegisteredCommand } from './postgres-command-registry.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

export function createPostgresProductionQualityStore({ pool } = {}) {
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
    async getQualityCaseByCode(qualityCaseCode) {
      const result = await client.query('SELECT payload FROM production_quality_cases WHERE quality_case_code = $1 FOR UPDATE', [qualityCaseCode]);
      return result.rows[0]?.payload;
    },
    async getQualityCaseByExecutionCode(executionCode) {
      const result = await client.query('SELECT payload FROM production_quality_cases WHERE execution_code = $1 FOR UPDATE', [executionCode]);
      return result.rows[0]?.payload;
    },
    async insertQualityCase(value) {
      try {
        await client.query(
          `INSERT INTO production_quality_cases (
             id, quality_case_code, execution_id, execution_code, execution_version,
             production_order_number, brand_id, supplier_code, sku, quantity,
             policy_version, status, version, payload, passed_at, rejected_at,
             shipping_release_at, created_at, updated_at
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15::timestamptz,$16::timestamptz,$17::timestamptz,$18::timestamptz,$19::timestamptz)`,
          parameters(value),
        );
      } catch (error) {
        if (error?.code === '23505') invariant(false, 'PRODUCTION_QUALITY_ALREADY_EXISTS', 'Production execution already has a quality case', { qualityCaseCode: value.qualityCaseCode, executionCode: value.executionCode });
        throw error;
      }
    },
    async saveQualityCase(value, expectedVersion) {
      invariant(value.version === expectedVersion + 1, 'VERSION_INCREMENT_INVALID', 'Production quality version must increment exactly once');
      const result = await client.query(
        `UPDATE production_quality_cases
            SET status = $4, version = $5, payload = $6::jsonb,
                passed_at = $7::timestamptz, rejected_at = $8::timestamptz,
                shipping_release_at = $9::timestamptz, updated_at = $10::timestamptz
          WHERE id = $1 AND quality_case_code = $2 AND brand_id = $3 AND version = $11`,
        [value.id, value.qualityCaseCode, value.brandId, value.status, value.version, JSON.stringify(value), value.passedAt, value.rejectedAt, value.shippingReleaseAt, value.updatedAt, expectedVersion],
      );
      invariant(result.rowCount === 1, 'PRODUCTION_QUALITY_CONCURRENCY_CONFLICT', 'Production quality concurrency conflict', { qualityCaseCode: value.qualityCaseCode, expectedVersion });
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
  return [value.id,value.qualityCaseCode,value.executionId,value.executionCode,value.executionVersion,value.productionOrderNumber,value.brandId,value.supplierCode,value.sku,value.quantity,value.policyVersion,value.status,value.version,JSON.stringify(value),value.passedAt,value.rejectedAt,value.shippingReleaseAt,value.createdAt,value.updatedAt];
}
