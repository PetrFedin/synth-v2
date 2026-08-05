import { invariant } from '../core/errors.mjs';
import { getRegisteredCommand, insertRegisteredCommand } from './postgres-command-registry.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

export function createPostgresProductionOrderStore({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function' && typeof pool.query === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({
    transaction: (work) => withPostgresTransaction(pool, work, { createView: view }),
  });
}

function view(client) {
  return Object.freeze({
    async getMembership(organisationId, userId) {
      const result = await client.query(
        'SELECT payload FROM memberships WHERE organisation_id = $1 AND user_id = $2 FOR SHARE',
        [organisationId, userId],
      );
      return result.rows[0]?.payload;
    },
    async getRfqByCode(rfqCode) {
      const result = await client.query(
        'SELECT payload FROM sourcing_rfqs WHERE rfq_code = $1 FOR SHARE',
        [rfqCode],
      );
      return result.rows[0]?.payload;
    },
    async getSupplierByCode(brandId, supplierCode) {
      if (!brandId || !supplierCode) return undefined;
      const result = await client.query(
        'SELECT payload FROM suppliers WHERE brand_id = $1 AND supplier_code = $2 FOR SHARE',
        [brandId, supplierCode],
      );
      return result.rows[0]?.payload;
    },
    async getProductionOrderByNumber(productionOrderNumber) {
      if (!productionOrderNumber) return undefined;
      const result = await client.query(
        'SELECT payload FROM production_orders WHERE production_order_number = $1 FOR UPDATE',
        [productionOrderNumber],
      );
      return result.rows[0]?.payload;
    },
    async getProductionOrderByRfqCode(rfqCode) {
      if (!rfqCode) return undefined;
      const result = await client.query(
        'SELECT payload FROM production_orders WHERE rfq_code = $1 FOR UPDATE',
        [rfqCode],
      );
      return result.rows[0]?.payload;
    },
    async insertProductionOrder(value) {
      try {
        await client.query(
          `INSERT INTO production_orders (
             id, production_order_number, rfq_id, rfq_code, rfq_version,
             brand_id, supplier_code, sku, sku_version, bom_version, quantity,
             status, version, production_start_at, delivery_due_at, payload,
             issued_at, confirmed_at, cancelled_at, created_at, updated_at
           ) VALUES (
             $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,
             $14::timestamptz,$15::timestamptz,$16::jsonb,$17::timestamptz,
             $18::timestamptz,$19::timestamptz,$20::timestamptz,$21::timestamptz
           )`,
          parameters(value),
        );
      } catch (error) {
        if (error?.code === '23505') {
          invariant(false, 'PRODUCTION_ORDER_ALREADY_EXISTS', 'Production Order number or RFQ already exists', {
            productionOrderNumber: value.productionOrderNumber,
            rfqCode: value.rfqCode,
          });
        }
        throw error;
      }
    },
    async saveProductionOrder(value, expectedVersion) {
      invariant(value.version === expectedVersion + 1, 'VERSION_INCREMENT_INVALID', 'Production Order version must increment exactly once');
      const result = await client.query(
        `UPDATE production_orders
            SET status = $4,
                version = $5,
                payload = $6::jsonb,
                issued_at = $7::timestamptz,
                confirmed_at = $8::timestamptz,
                cancelled_at = $9::timestamptz,
                updated_at = $10::timestamptz
          WHERE id = $1
            AND production_order_number = $2
            AND brand_id = $3
            AND version = $11`,
        [
          value.id,
          value.productionOrderNumber,
          value.brandId,
          value.status,
          value.version,
          JSON.stringify(value),
          value.issuedAt,
          value.confirmedAt,
          value.cancelledAt,
          value.updatedAt,
          expectedVersion,
        ],
      );
      invariant(result.rowCount === 1, 'PRODUCTION_ORDER_CONCURRENCY_CONFLICT', 'Production Order concurrency conflict', {
        productionOrderNumber: value.productionOrderNumber,
        expectedVersion,
      });
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

function parameters(value) {
  return [
    value.id,
    value.productionOrderNumber,
    value.rfqId,
    value.rfqCode,
    value.rfqVersion,
    value.brandId,
    value.supplierCode,
    value.sku,
    value.skuVersion,
    value.bomVersion,
    value.quantity,
    value.status,
    value.version,
    value.productionStartAt,
    value.deliveryDueAt,
    JSON.stringify(value),
    value.issuedAt,
    value.confirmedAt,
    value.cancelledAt,
    value.createdAt,
    value.updatedAt,
  ];
}
