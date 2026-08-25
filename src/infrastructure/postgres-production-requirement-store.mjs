import { invariant } from '../core/errors.mjs';
import { getRegisteredCommand, insertRegisteredCommand } from './postgres-command-registry.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

export function createPostgresProductionRequirementStore({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function' && typeof pool.query === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({
    transaction: (work) => withPostgresTransaction(pool, work, { createView: view }),
    async getProductionRequirement(id) {
      return payloadOne(pool, 'SELECT payload FROM production_requirement_snapshots WHERE id = $1', [id]);
    },
    async getProductionRequirementBySupplyCommitment(supplyCommitmentSnapshotId) {
      return payloadOne(pool, 'SELECT payload FROM production_requirement_snapshots WHERE supply_commitment_snapshot_id = $1', [supplyCommitmentSnapshotId]);
    },
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
    async getOrder(id) {
      const result = await client.query('SELECT payload FROM orders WHERE id = $1 FOR SHARE', [id]);
      return result.rows[0]?.payload;
    },
    async getOrderCommitSnapshot(id) {
      const result = await client.query('SELECT payload FROM order_commit_snapshots WHERE id = $1 FOR SHARE', [id]);
      return result.rows[0]?.payload;
    },
    async getSupplyCommitment(id) {
      const result = await client.query('SELECT payload FROM supply_commitment_snapshots WHERE id = $1 FOR SHARE', [id]);
      return result.rows[0]?.payload;
    },
    async getProductionRequirementBySupplyCommitment(supplyCommitmentSnapshotId) {
      const result = await client.query(
        'SELECT payload FROM production_requirement_snapshots WHERE supply_commitment_snapshot_id = $1 FOR SHARE',
        [supplyCommitmentSnapshotId],
      );
      return result.rows[0]?.payload;
    },
    async insertProductionRequirement(value) {
      try {
        await client.query(
          `INSERT INTO production_requirement_snapshots (
             id, order_id, order_commit_snapshot_id, supply_commitment_snapshot_id, lineage_version,
             brand_id, shop_id, collection_id, showroom_id, commercial_publication_id, buyer_catalog_version_id,
             total_production_quantity, status, created_at, content_hash, payload
           ) VALUES (
             $1,$2,$3,$4,1,$5,$6,$7,$8,$9,$10,$11,'required',$12::timestamptz,$13,$14::jsonb
           )`,
          [
            value.id,
            value.orderId,
            value.orderCommitSnapshotId,
            value.supplyCommitmentSnapshotId,
            value.brandId,
            value.shopId,
            value.collectionId,
            value.showroomId,
            value.commercialPublicationId,
            value.buyerCatalogVersionId,
            value.totalProductionQuantity,
            value.createdAt,
            value.contentHash,
            JSON.stringify(value),
          ],
        );
        for (const line of value.lines) {
          await client.query(
            `INSERT INTO production_requirement_lines (
               production_requirement_snapshot_id, brand_id, order_line_no, product_sku_id, sku,
               style_id, style_version_id, colorway_id, size_value_id, size_code,
               ordered_quantity, production_quantity
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
            [
              value.id,
              value.brandId,
              line.orderLineNo,
              line.productSkuId,
              line.sku,
              line.styleId,
              line.styleVersionId,
              line.colorwayId,
              line.sizeValueId,
              line.sizeCode,
              line.orderedQuantity,
              line.productionQuantity,
            ],
          );
        }
      } catch (error) {
        if (error?.code === '23505') {
          invariant(false, 'PRODUCTION_REQUIREMENT_ALREADY_EXISTS', 'Immutable production requirement already exists', {
            productionRequirementSnapshotId: value.id,
            supplyCommitmentSnapshotId: value.supplyCommitmentSnapshotId,
          });
        }
        throw error;
      }
    },
    getCommand: (id) => getRegisteredCommand(client, 'wholesale', id),
    insertCommand: (value) => insertRegisteredCommand(client, 'wholesale', value),
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

async function payloadOne(pool, sql, values) {
  const result = await pool.query(sql, values);
  return result.rows[0]?.payload;
}
