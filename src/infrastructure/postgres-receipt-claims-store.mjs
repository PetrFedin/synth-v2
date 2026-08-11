import { invariant } from '../core/errors.mjs';
import { getRegisteredCommand, insertRegisteredCommand } from './postgres-command-registry.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

export function createPostgresReceiptClaimsStore({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function' && typeof pool.query === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({
    transaction: (work) => withPostgresTransaction(pool, work, { createView: view }),
    getClaim: (id) => payloadOne(pool, 'SELECT payload FROM receipt_discrepancy_claim_snapshots WHERE id = $1', [id]),
    getResolution: (id) => payloadOne(pool, 'SELECT payload FROM receipt_claim_resolution_snapshots WHERE id = $1', [id]),
  });
}

function view(client) {
  return Object.freeze({
    async getMembership(organisationId, userId) {
      const result = await client.query('SELECT payload FROM memberships WHERE organisation_id = $1 AND user_id = $2 FOR SHARE', [organisationId, userId]);
      return result.rows[0]?.payload;
    },
    async lockDiscrepancy(id, actorId) {
      const result = await client.query(
        `SELECT discrepancy.payload
           FROM receipt_discrepancy_snapshots AS discrepancy
          WHERE discrepancy.id = $1
            AND EXISTS (
              SELECT 1
                FROM memberships AS membership
               WHERE membership.organisation_id = discrepancy.shop_id
                 AND membership.user_id = $2
                 AND membership.status = 'active'
            )
          FOR UPDATE OF discrepancy`,
        [id, actorId],
      );
      return result.rows[0]?.payload;
    },
    async getClaimByDiscrepancy(id) {
      const result = await client.query('SELECT payload FROM receipt_discrepancy_claim_snapshots WHERE receipt_discrepancy_snapshot_id = $1 FOR SHARE', [id]);
      return result.rows[0]?.payload;
    },
    async getClaim(id, actorId) {
      const result = await client.query(
        `SELECT claim.payload
           FROM receipt_discrepancy_claim_snapshots AS claim
          WHERE claim.id = $1
            AND EXISTS (
              SELECT 1
                FROM memberships AS membership
               WHERE membership.user_id = $2
                 AND membership.status = 'active'
                 AND membership.organisation_id IN (claim.brand_id, claim.shop_id)
            )
          FOR SHARE OF claim`,
        [id, actorId],
      );
      return result.rows[0]?.payload;
    },
    async lockClaim(id, actorId) {
      const result = await client.query(
        `SELECT claim.payload
           FROM receipt_discrepancy_claim_snapshots AS claim
          WHERE claim.id = $1
            AND EXISTS (
              SELECT 1
                FROM memberships AS membership
               WHERE membership.organisation_id = claim.brand_id
                 AND membership.user_id = $2
                 AND membership.status = 'active'
            )
          FOR UPDATE OF claim`,
        [id, actorId],
      );
      return result.rows[0]?.payload;
    },
    async getResolutionByClaim(id) {
      const result = await client.query('SELECT payload FROM receipt_claim_resolution_snapshots WHERE claim_snapshot_id = $1 FOR SHARE', [id]);
      return result.rows[0]?.payload;
    },
    async getResolution(id, actorId) {
      const result = await client.query(
        `SELECT resolution.payload
           FROM receipt_claim_resolution_snapshots AS resolution
          WHERE resolution.id = $1
            AND EXISTS (
              SELECT 1
                FROM memberships AS membership
               WHERE membership.user_id = $2
                 AND membership.status = 'active'
                 AND membership.organisation_id IN (resolution.brand_id, resolution.shop_id)
            )
          FOR SHARE OF resolution`,
        [id, actorId],
      );
      return result.rows[0]?.payload;
    },
    async insertClaim(value) {
      try {
        await client.query(
          `INSERT INTO receipt_discrepancy_claim_snapshots
            (id, order_id, order_version, order_commit_snapshot_id, supply_commitment_snapshot_id,
             fulfillment_plan_snapshot_id, shipment_notice_snapshot_id, latest_receipt_snapshot_id,
             receipt_discrepancy_snapshot_id, receipt_discrepancy_content_hash, brand_id, shop_id,
             claim_reference, reason, requested_remedy, issue_count, lines, status, submitted_at, content_hash, payload)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18,$19,$20,$21::jsonb)`,
          [value.id, value.orderId, value.orderVersion, value.orderCommitSnapshotId, value.supplyCommitmentSnapshotId,
            value.fulfillmentPlanSnapshotId, value.shipmentNoticeSnapshotId, value.latestReceiptSnapshotId,
            value.receiptDiscrepancySnapshotId, value.receiptDiscrepancyContentHash, value.brandId, value.shopId,
            value.claimReference, value.reason, value.requestedRemedy, value.issueCount, JSON.stringify(value.lines),
            value.status, value.submittedAt, value.contentHash, JSON.stringify(value)],
        );
      } catch (error) {
        if (error?.code === '23505') invariant(false, 'RECEIPT_CLAIM_ALREADY_EXISTS', 'Receipt discrepancy already has a claim or claim reference is already used', { receiptDiscrepancySnapshotId: value.receiptDiscrepancySnapshotId, claimReference: value.claimReference });
        throw error;
      }
    },
    async insertResolution(value) {
      try {
        await client.query(
          `INSERT INTO receipt_claim_resolution_snapshots
            (id, claim_snapshot_id, claim_content_hash, order_id, order_version, order_commit_snapshot_id,
             supply_commitment_snapshot_id, fulfillment_plan_snapshot_id, shipment_notice_snapshot_id,
             latest_receipt_snapshot_id, receipt_discrepancy_snapshot_id, brand_id, shop_id,
             resolution_type, resolution_reason, status, resolved_at, content_hash, payload)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19::jsonb)`,
          [value.id, value.claimSnapshotId, value.claimContentHash, value.orderId, value.orderVersion, value.orderCommitSnapshotId,
            value.supplyCommitmentSnapshotId, value.fulfillmentPlanSnapshotId, value.shipmentNoticeSnapshotId,
            value.latestReceiptSnapshotId, value.receiptDiscrepancySnapshotId, value.brandId, value.shopId,
            value.resolutionType, value.resolutionReason, value.status, value.resolvedAt, value.contentHash, JSON.stringify(value)],
        );
      } catch (error) {
        if (error?.code === '23505') invariant(false, 'RECEIPT_CLAIM_ALREADY_RESOLVED', 'Receipt claim already has an immutable resolution', { claimSnapshotId: value.claimSnapshotId });
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
