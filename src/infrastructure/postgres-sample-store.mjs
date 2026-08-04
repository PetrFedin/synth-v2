import { invariant } from '../core/errors.mjs';
import { getRegisteredCommand, insertRegisteredCommand } from './postgres-command-registry.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

export function createPostgresSampleStore({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function' && typeof pool.query === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({
    transaction: (work) => withPostgresTransaction(pool, work, { createView: view }),
    async getSampleByCode(sampleCode) {
      const result = await pool.query('SELECT payload FROM samples WHERE sample_code = $1', [sampleCode]);
      return result.rows[0]?.payload;
    },
  });
}

function view(client) {
  return Object.freeze({
    async getMembership(organisationId, userId) {
      const result = await client.query('SELECT payload FROM memberships WHERE organisation_id = $1 AND user_id = $2 FOR SHARE', [organisationId, userId]);
      return result.rows[0]?.payload;
    },
    async getSku(sku) {
      const result = await client.query('SELECT payload FROM catalog_skus WHERE sku = $1 FOR SHARE', [sku]);
      return result.rows[0]?.payload;
    },
    async getSampleByCode(sampleCode) {
      const result = await client.query('SELECT payload FROM samples WHERE sample_code = $1 FOR UPDATE', [sampleCode]);
      return result.rows[0]?.payload;
    },
    async getSampleBySource(sourceSampleCode) {
      const result = await client.query('SELECT payload FROM samples WHERE source_sample_code = $1 FOR UPDATE', [sourceSampleCode]);
      return result.rows[0]?.payload;
    },
    async insertSample(sample) {
      try {
        await client.query(
          `INSERT INTO samples
             (id, sample_code, sku, brand_id, sku_version, sample_type, round, status, supplier_code, due_at,
              version, source_sample_code, payload, created_at, updated_at, requested_at, production_started_at,
              received_at, decision_at, cancelled_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::timestamptz,
                   $11, $12, $13::jsonb, $14::timestamptz, $15::timestamptz, $16::timestamptz,
                   $17::timestamptz, $18::timestamptz, $19::timestamptz, $20::timestamptz)`,
          insertParameters(sample),
        );
      } catch (error) {
        if (error?.code === '23505') invariant(false, 'SAMPLE_ALREADY_EXISTS', 'Sample code, type round or next-round source already exists', { sampleCode: sample.sampleCode, sku: sample.sku, sampleType: sample.sampleType, round: sample.round, sourceSampleCode: sample.sourceSampleCode });
        throw error;
      }
    },
    async saveSample(sample, expectedVersion) {
      invariant(sample.version === expectedVersion + 1, 'VERSION_INCREMENT_INVALID', 'Version must increment exactly once');
      const result = await client.query(
        `UPDATE samples
            SET sku_version = $4, status = $5, supplier_code = $6, due_at = $7::timestamptz,
                version = $8, payload = $9::jsonb, updated_at = $10::timestamptz,
                requested_at = $11::timestamptz, production_started_at = $12::timestamptz,
                received_at = $13::timestamptz, decision_at = $14::timestamptz,
                cancelled_at = $15::timestamptz
          WHERE id = $1 AND sample_code = $2 AND brand_id = $3 AND version = $16`,
        updateParameters(sample, expectedVersion),
      );
      invariant(result.rowCount === 1, 'SAMPLE_CONCURRENCY_CONFLICT', 'Sample concurrency conflict', { sampleCode: sample.sampleCode, expectedVersion });
    },
    getCommand: (id) => getRegisteredCommand(client, 'catalog', id),
    insertCommand: (value) => insertRegisteredCommand(client, 'catalog', value),
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

function insertParameters(sample) {
  return [sample.id, sample.sampleCode, sample.sku, sample.brandId, sample.skuVersion, sample.sampleType, sample.round, sample.status, sample.supplierCode, sample.dueAt, sample.version, sample.sourceSampleCode, JSON.stringify(sample), sample.createdAt, sample.updatedAt, sample.requestedAt, sample.productionStartedAt, sample.receivedAt, sample.decisionAt, sample.cancelledAt];
}
function updateParameters(sample, expectedVersion) {
  return [sample.id, sample.sampleCode, sample.brandId, sample.skuVersion, sample.status, sample.supplierCode, sample.dueAt, sample.version, JSON.stringify(sample), sample.updatedAt, sample.requestedAt, sample.productionStartedAt, sample.receivedAt, sample.decisionAt, sample.cancelledAt, expectedVersion];
}
