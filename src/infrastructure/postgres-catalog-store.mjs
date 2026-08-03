import { invariant } from '../core/errors.mjs';
import { getRegisteredCommand, insertRegisteredCommand } from './postgres-command-registry.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

export function createPostgresCatalogStore({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function' && typeof pool.query === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({
    transaction: (work) => withPostgresTransaction(pool, work, { createView: view }),
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
    async getCollection(id) {
      const result = await client.query('SELECT payload FROM collections WHERE id = $1 FOR SHARE', [id]);
      return result.rows[0]?.payload;
    },
    async getMembership(organisationId, userId) {
      const result = await client.query(
        'SELECT payload FROM memberships WHERE organisation_id = $1 AND user_id = $2 FOR SHARE',
        [organisationId, userId],
      );
      return result.rows[0]?.payload;
    },
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
    getCommand: (id) => getRegisteredCommand(client, 'catalog', id),
    insertCommand: (value) => insertRegisteredCommand(client, 'catalog', value),
    async appendOutbox(event) {
      try {
        await client.query(
          `INSERT INTO outbox_events
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
