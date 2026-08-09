import { invariant } from '../core/errors.mjs';
import { getRegisteredCommand, insertRegisteredCommand } from './postgres-command-registry.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

export function createPostgresCommercialPublicationStore({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function' && typeof pool.query === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({
    transaction: (work) => withPostgresTransaction(pool, work, { createView: view }),
    async getCommercialPublication(id) {
      const result = await pool.query('SELECT payload FROM commercial_publications WHERE id = $1', [id]);
      return result.rows[0]?.payload;
    },
    async getBuyerCatalogVersion(id) {
      const result = await pool.query('SELECT payload FROM buyer_catalog_versions WHERE id = $1', [id]);
      return result.rows[0]?.payload;
    },
    async getBuyerCatalogForAccess(showroomId, shopId) {
      const result = await pool.query(
        `SELECT payload FROM buyer_catalog_versions
          WHERE showroom_id = $1 AND shop_id = $2
          ORDER BY published_at DESC, id DESC LIMIT 1`,
        [showroomId, shopId],
      );
      return result.rows[0]?.payload;
    },
  });
}

function view(client) {
  return Object.freeze({
    async getCommercialPublication(id) {
      const result = await client.query('SELECT payload FROM commercial_publications WHERE id = $1 FOR SHARE', [id]);
      return result.rows[0]?.payload;
    },
    async insertCommercialPublication(value) {
      await insertImmutable(client, 'commercial_publications', [
        value.id, value.brandId, value.collectionId, value.currency, value.publishedAt, value.contentHash, JSON.stringify(value),
      ], `INSERT INTO commercial_publications
            (id, brand_id, collection_id, currency, published_at, content_hash, payload)
          VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`, 'COMMERCIAL_PUBLICATION_ALREADY_EXISTS', { publicationId: value.id });
    },
    async insertPriceListVersion(value) {
      await insertImmutable(client, 'price_list_versions', [
        value.id, value.publicationId, value.brandId, value.shopId, value.currency, value.publishedAt, value.contentHash, JSON.stringify(value),
      ], `INSERT INTO price_list_versions
            (id, publication_id, brand_id, shop_id, currency, published_at, content_hash, payload)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`, 'PRICE_LIST_VERSION_ALREADY_EXISTS', { priceListVersionId: value.id });
    },
    async insertBuyerCatalogVersion(value) {
      await insertImmutable(client, 'buyer_catalog_versions', [
        value.id, value.publicationId, value.priceListVersionId, value.brandId, value.shopId, value.showroomId,
        value.accessGrantId, value.currency, value.publishedAt, value.contentHash, JSON.stringify(value),
      ], `INSERT INTO buyer_catalog_versions
            (id, publication_id, price_list_version_id, brand_id, shop_id, showroom_id, access_grant_id, currency, published_at, content_hash, payload)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)`, 'BUYER_CATALOG_VERSION_ALREADY_EXISTS', { buyerCatalogVersionId: value.id });
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

async function insertImmutable(client, table, values, sql, conflictCode, details) {
  try {
    await client.query(sql, values);
  } catch (error) {
    if (error?.code === '23505') invariant(false, conflictCode, `${table} immutable record already exists`, details);
    throw error;
  }
}
