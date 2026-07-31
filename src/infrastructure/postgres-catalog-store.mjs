import { invariant } from '../core/errors.mjs';

export function createPostgresCatalogStore({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function' && typeof pool.query === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({
    async transaction(work) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await work(view(client));
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally { client.release(); }
    },
    async getSku(sku) {
      const result = await pool.query('SELECT payload FROM catalog_skus WHERE sku = $1', [sku]);
      return result.rows[0]?.payload;
    },
    async snapshot() {
      const result = await pool.query('SELECT payload FROM catalog_skus ORDER BY sku');
      return Object.freeze({ skus: result.rows.map((row) => row.payload) });
    },
  });
}

function view(client) {
  return Object.freeze({
    async getSku(sku) {
      const result = await client.query('SELECT payload FROM catalog_skus WHERE sku = $1 FOR UPDATE', [sku]);
      return result.rows[0]?.payload;
    },
    async insertSku(value) {
      try {
        await client.query(
          `INSERT INTO catalog_skus
             (sku, collection_id, brand_id, status, currency, wholesale_price, minimum_order_quantity, available_quantity, reserved_quantity, version, payload)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)`,
          [
            value.sku, value.collectionId, value.brandId, value.status, value.currency, value.wholesalePrice,
            value.minimumOrderQuantity, value.availableQuantity, value.reservedQuantity, value.version, JSON.stringify(value),
          ],
        );
      } catch (error) {
        if (error?.code === '23505') invariant(false, 'CATALOG_SKU_ALREADY_EXISTS', 'Catalog SKU already exists', { sku: value.sku });
        throw error;
      }
    },
    async saveSku(value, expectedVersion) {
      invariant(value.version === expectedVersion + 1, 'VERSION_INCREMENT_INVALID', 'Version must increment exactly once');
      const result = await client.query(
        `UPDATE catalog_skus
            SET status = $2,
                currency = $3,
                wholesale_price = $4,
                minimum_order_quantity = $5,
                available_quantity = $6,
                reserved_quantity = $7,
                version = $8,
                payload = $9::jsonb
          WHERE sku = $1 AND version = $10`,
        [
          value.sku, value.status, value.currency, value.wholesalePrice, value.minimumOrderQuantity,
          value.availableQuantity, value.reservedQuantity, value.version, JSON.stringify(value), expectedVersion,
        ],
      );
      invariant(result.rowCount === 1, 'CATALOG_SKU_CONCURRENCY_CONFLICT', 'Catalog SKU concurrency conflict', { sku: value.sku, expectedVersion });
    },
    async getCommand(id) {
      const result = await client.query('SELECT id, fingerprint, actor_id, result, completed_at FROM catalog_commands WHERE id = $1', [id]);
      const row = result.rows[0];
      return row ? Object.freeze({ id: row.id, fingerprint: row.fingerprint, actorId: row.actor_id, result: row.result, completedAt: row.completed_at.toISOString?.() ?? row.completed_at }) : undefined;
    },
    async insertCommand(value) {
      try {
        await client.query(
          'INSERT INTO catalog_commands (id, fingerprint, actor_id, result, completed_at) VALUES ($1, $2, $3, $4::jsonb, $5)',
          [value.id, value.fingerprint, value.actorId, JSON.stringify(value.result), value.completedAt],
        );
      } catch (error) {
        if (error?.code === '23505') invariant(false, 'COMMAND_ALREADY_EXISTS', 'Command already exists', { commandId: value.id });
        throw error;
      }
    },
    async appendOutbox(event) {
      try {
        await client.query(
          `INSERT INTO catalog_outbox_events
             (id, event_type, aggregate_id, status, event, published_at)
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
