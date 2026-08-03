import { invariant } from '../core/errors.mjs';
import { getRegisteredCommand, insertRegisteredCommand } from './postgres-command-registry.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

export function createPostgresMaterialStore({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function' && typeof pool.query === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({
    transaction: (work) => withPostgresTransaction(pool, work, { createView: view }),
    async getMaterial(code) {
      const result = await pool.query('SELECT payload FROM materials WHERE code = $1', [code]);
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
    async getMaterial(code) {
      const result = await client.query('SELECT payload FROM materials WHERE code = $1 FOR UPDATE', [code]);
      return result.rows[0]?.payload;
    },
    async insertMaterial(value) {
      try {
        await client.query(
          `INSERT INTO materials
             (code, brand_id, status, material_type, unit, currency, unit_cost, minimum_order_quantity, available_quantity, reserved_quantity, version, payload)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)`,
          [value.code, value.brandId, value.status, value.type, value.unit, value.currency, value.unitCost, value.minimumOrderQuantity, value.availableQuantity, value.reservedQuantity, value.version, JSON.stringify(value)],
        );
      } catch (error) {
        if (error?.code === '23505') invariant(false, 'MATERIAL_ALREADY_EXISTS', 'Material already exists', { code: value.code });
        throw error;
      }
    },
    async saveMaterial(value, expectedVersion) {
      invariant(value.version === expectedVersion + 1, 'VERSION_INCREMENT_INVALID', 'Version must increment exactly once');
      const result = await client.query(
        `UPDATE materials
            SET status = $2, material_type = $3, unit = $4, currency = $5, unit_cost = $6,
                minimum_order_quantity = $7, available_quantity = $8, reserved_quantity = $9,
                version = $10, payload = $11::jsonb
          WHERE code = $1 AND version = $12`,
        [value.code, value.status, value.type, value.unit, value.currency, value.unitCost, value.minimumOrderQuantity, value.availableQuantity, value.reservedQuantity, value.version, JSON.stringify(value), expectedVersion],
      );
      invariant(result.rowCount === 1, 'MATERIAL_CONCURRENCY_CONFLICT', 'Material concurrency conflict', { code: value.code, expectedVersion });
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
