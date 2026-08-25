import { invariant } from '../core/errors.mjs';
import { getRegisteredCommand, insertRegisteredCommand } from './postgres-command-registry.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

export function createPostgresProductionSourcingStore({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function' && typeof pool.query === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({
    transaction: (work) => withPostgresTransaction(pool, work, { createView: view }),
  });
}

function view(client) {
  return Object.freeze({
    async getMembership(organisationId, userId) {
      const result = await client.query('SELECT payload FROM memberships WHERE organisation_id = $1 AND user_id = $2 FOR SHARE', [organisationId, userId]);
      return result.rows[0]?.payload;
    },
    async getProductionRequirement(id) {
      const result = await client.query('SELECT payload FROM production_requirement_snapshots WHERE id = $1 FOR SHARE', [id]);
      return result.rows[0]?.payload;
    },
    async getActiveRfqByProductionRequirementLine(productionRequirementSnapshotId, orderLineNo) {
      const result = await client.query(
        `SELECT payload
           FROM sourcing_rfqs
          WHERE production_requirement_snapshot_id = $1
            AND production_requirement_order_line_no = $2
            AND status <> 'cancelled'
          ORDER BY created_at DESC, id DESC
          LIMIT 1
          FOR SHARE`,
        [productionRequirementSnapshotId, orderLineNo],
      );
      return result.rows[0]?.payload;
    },
    async getProductSku(id) {
      const result = await client.query(
        `SELECT id, sku_code, brand_id, style_version_id, colorway_id, size_value_id, gtin, content_hash
           FROM product_skus
          WHERE id = $1
          FOR SHARE`,
        [id],
      );
      const row = result.rows[0];
      if (!row) return undefined;
      return Object.freeze({
        id: row.id,
        skuCode: row.sku_code,
        brandId: row.brand_id,
        styleVersionId: row.style_version_id,
        colorwayId: row.colorway_id,
        sizeValueId: row.size_value_id,
        gtin: row.gtin,
        contentHash: row.content_hash,
      });
    },
    async getCatalogSku(sku) {
      const result = await client.query('SELECT payload FROM catalog_skus WHERE sku = $1 FOR SHARE', [sku]);
      return result.rows[0]?.payload;
    },
    async getBomByProductSku(productSkuId) {
      const result = await client.query(
        `SELECT payload, product_sku_id
           FROM boms
          WHERE product_sku_id = $1
          FOR SHARE`,
        [productSkuId],
      );
      const row = result.rows[0];
      if (!row) return undefined;
      return Object.freeze({ ...row.payload, productSkuId: row.product_sku_id });
    },
    async getSuppliersByCodes(codes) {
      if (!Array.isArray(codes) || !codes.length) return [];
      const result = await client.query('SELECT payload FROM suppliers WHERE supplier_code = ANY($1::text[]) ORDER BY supplier_code FOR SHARE', [codes]);
      return result.rows.map((row) => row.payload);
    },
    async insertRfq(rfq) {
      try {
        await client.query(
          `INSERT INTO sourcing_rfqs (
             id, rfq_code, brand_id, sku, product_sku_id, sku_version, bom_version, status, target_quantity,
             response_due_at, delivery_due_at, selected_supplier_code, version, lineage_version,
             production_requirement_snapshot_id, production_requirement_order_line_no, production_requirement_content_hash,
             payload, created_at, updated_at, issued_at, awarded_at, allocated_at, cancelled_at
           ) VALUES (
             $1,$2,$3,$4,$5,$6,$7,$8,$9,$10::timestamptz,$11::timestamptz,$12,$13,2,$14,$15,$16,
             $17::jsonb,$18::timestamptz,$19::timestamptz,$20::timestamptz,$21::timestamptz,$22::timestamptz,$23::timestamptz
           )`,
          [
            rfq.id,
            rfq.rfqCode,
            rfq.brandId,
            rfq.sku,
            rfq.productSkuId,
            rfq.skuVersion,
            rfq.bomVersion,
            rfq.status,
            rfq.targetQuantity,
            rfq.responseDueAt,
            rfq.deliveryDueAt,
            rfq.selectedSupplierCode,
            rfq.version,
            rfq.productionRequirementSnapshotId,
            rfq.productionRequirementOrderLineNo,
            rfq.productionRequirementContentHash,
            JSON.stringify(rfq),
            rfq.createdAt,
            rfq.updatedAt,
            rfq.issuedAt,
            rfq.awardedAt,
            rfq.allocatedAt,
            rfq.cancelledAt,
          ],
        );
      } catch (error) {
        if (error?.code === '23505') invariant(false, 'PRODUCTION_RFQ_ALREADY_EXISTS', 'RFQ code or active production requirement line already has an RFQ', { rfqCode: rfq.rfqCode, productionRequirementSnapshotId: rfq.productionRequirementSnapshotId, orderLineNo: rfq.productionRequirementOrderLineNo });
        throw error;
      }
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
