import { invariant } from '../core/errors.mjs';
import { getRegisteredCommand, insertRegisteredCommand } from './postgres-command-registry.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

export function createPostgresSupplierRecoveryStore({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function' && typeof pool.query === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({
    transaction: (work) => withPostgresTransaction(pool, work, { createView: view }),
    getRecovery: (id) => payloadOne(pool, 'SELECT payload FROM supplier_claim_recovery_snapshots WHERE id = $1', [id]),
  });
}

function view(client) {
  return Object.freeze({
    async getMembership(organisationId, userId) { const r = await client.query('SELECT payload FROM memberships WHERE organisation_id=$1 AND user_id=$2 FOR SHARE', [organisationId,userId]); return r.rows[0]?.payload; },
    async lockResolution(id, actorId) {
      const r = await client.query(
        `SELECT resolution.payload
           FROM receipt_claim_resolution_snapshots AS resolution
          WHERE resolution.id = $1
            AND EXISTS (
              SELECT 1
                FROM memberships AS membership
               WHERE membership.organisation_id = resolution.brand_id
                 AND membership.user_id = $2
                 AND membership.status = 'active'
            )
          FOR UPDATE OF resolution`,
        [id, actorId],
      );
      return r.rows[0]?.payload;
    },
    async getClaim(id) { const r = await client.query('SELECT payload FROM receipt_discrepancy_claim_snapshots WHERE id=$1 FOR SHARE', [id]); return r.rows[0]?.payload; },
    async getSupplierByCode(brandId, supplierCode) { const r = await client.query('SELECT payload FROM suppliers WHERE brand_id=$1 AND supplier_code=$2 FOR SHARE', [brandId,supplierCode]); return r.rows[0]?.payload; },
    async getOrder(id) { const r = await client.query('SELECT payload FROM orders WHERE id=$1 FOR SHARE', [id]); return r.rows[0]?.payload; },
    async getOrderCommitSnapshot(id) { const r = await client.query('SELECT payload FROM order_commit_snapshots WHERE id=$1 FOR SHARE', [id]); return r.rows[0]?.payload; },
    async getSupplyCommitment(id) { const r = await client.query('SELECT payload FROM supply_commitment_snapshots WHERE id=$1 FOR SHARE', [id]); return r.rows[0]?.payload; },
    async getFxRateSnapshot(id) { const r = await client.query('SELECT payload FROM order_fx_rate_snapshots WHERE id=$1 FOR SHARE', [id]); return r.rows[0]?.payload; },
    async lockCostLedgerAndGetClose(orderCommitSnapshotId) {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [orderCommitSnapshotId]);
      const r = await client.query('SELECT payload FROM cost_close_snapshots WHERE order_commit_snapshot_id=$1 FOR UPDATE', [orderCommitSnapshotId]);
      return r.rows[0]?.payload ?? null;
    },
    async getLatestPostCloseAdjustment(costCloseSnapshotId) { const r = await client.query('SELECT payload FROM post_close_adjustments WHERE cost_close_snapshot_id=$1 ORDER BY recorded_at DESC,id DESC LIMIT 1 FOR SHARE', [costCloseSnapshotId]); return r.rows[0]?.payload; },
    async getLandedCostSnapshot(id) { const r = await client.query('SELECT payload FROM landed_cost_snapshots WHERE id=$1 FOR SHARE', [id]); return r.rows[0]?.payload; },
    async getMarginActualizationSnapshot(id) { const r = await client.query('SELECT payload FROM margin_actualization_snapshots WHERE id=$1 FOR SHARE', [id]); return r.rows[0]?.payload; },
    async listActualCostEntries(orderId) { const r = await client.query('SELECT payload FROM actual_cost_ledger_entries WHERE order_id=$1 ORDER BY recorded_at,id FOR SHARE', [orderId]); return r.rows.map((row)=>row.payload); },
    async insertPhysicalActualCostEntry(value) {
      await client.query(`INSERT INTO actual_cost_ledger_entries
        (id,order_id,order_commit_snapshot_id,lineage_version,supply_commitment_snapshot_id,physical_lineage_version,
         fulfillment_plan_snapshot_id,shipment_notice_snapshot_id,receipt_snapshot_id,receipt_discrepancy_snapshot_id,
         brand_id,shop_id,entry_kind,reversal_of_entry_id,correction_id,correction_reason,cost_type,
         source_amount,source_currency,fx_rate_snapshot_id,amount,currency,sku,source_ref,occurred_at,recorded_at,payload)
        VALUES ($1,$2,$3,3,$4,2,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25::jsonb)`,
      [value.id,value.orderId,value.orderCommitSnapshotId,value.supplyCommitmentSnapshotId,value.fulfillmentPlanSnapshotId,value.shipmentNoticeSnapshotId,value.receiptSnapshotId,value.receiptDiscrepancySnapshotId,value.brandId,value.shopId,value.entryKind,value.reversalOfEntryId,value.correctionId,value.correctionReason,value.costType,value.sourceAmount,value.sourceCurrency,value.fxRateSnapshotId,value.amount,value.currency,value.sku,value.sourceRef,value.occurredAt,value.recordedAt,JSON.stringify(value)]);
    },
    async insertLandedCostSnapshot(value) { await client.query(`INSERT INTO landed_cost_snapshots (id,order_id,order_commit_snapshot_id,lineage_version,currency,total_cost,created_at,content_hash,payload) VALUES ($1,$2,$3,2,$4,$5,$6,$7,$8::jsonb)`, [value.id,value.orderId,value.orderCommitSnapshotId,value.currency,value.totalCost,value.createdAt,value.contentHash,JSON.stringify(value)]); },
    async insertMarginActualizationSnapshot(value) { await client.query(`INSERT INTO margin_actualization_snapshots (id,order_id,order_commit_snapshot_id,lineage_version,landed_cost_snapshot_id,currency,net_revenue,landed_cost,contribution_margin_amount,contribution_margin_percent,created_at,content_hash,payload) VALUES ($1,$2,$3,2,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)`, [value.id,value.orderId,value.orderCommitSnapshotId,value.landedCostSnapshotId,value.currency,value.netRevenue,value.landedCost,value.contributionMarginAmount,value.contributionMarginPercent,value.createdAt,value.contentHash,JSON.stringify(value)]); },
    async insertPostCloseAdjustment(value) { await client.query(`INSERT INTO post_close_adjustments
      (id,cost_close_snapshot_id,previous_adjustment_id,order_id,order_commit_snapshot_id,actual_cost_entry_id,prior_landed_cost_snapshot_id,landed_cost_snapshot_id,prior_margin_actualization_snapshot_id,margin_actualization_snapshot_id,cost_delta_amount,margin_delta_amount,reason,recorded_at,content_hash,payload)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb)`, [value.id,value.costCloseSnapshotId,value.previousAdjustmentId,value.orderId,value.orderCommitSnapshotId,value.actualCostEntryId,value.priorLandedCostSnapshotId,value.landedCostSnapshotId,value.priorMarginActualizationSnapshotId,value.marginActualizationSnapshotId,value.costDeltaAmount,value.marginDeltaAmount,value.reason,value.recordedAt,value.contentHash,JSON.stringify(value)]); },
    async insertRecovery(value) { try { await client.query(`INSERT INTO supplier_claim_recovery_snapshots
      (id,claim_resolution_snapshot_id,claim_resolution_content_hash,claim_snapshot_id,order_id,order_version,order_commit_snapshot_id,supply_commitment_snapshot_id,fulfillment_plan_snapshot_id,shipment_notice_snapshot_id,receipt_snapshot_id,receipt_discrepancy_snapshot_id,brand_id,shop_id,supplier_id,supplier_code,supplier_status,actual_cost_entry_id,source_recovery_amount,source_currency,recovery_amount,currency,landed_cost_snapshot_id,margin_actualization_snapshot_id,cost_close_snapshot_id,post_close_adjustment_id,reason,status,recorded_at,content_hash,payload)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31::jsonb)`,
      [value.id,value.claimResolutionSnapshotId,value.claimResolutionContentHash,value.claimSnapshotId,value.orderId,value.orderVersion,value.orderCommitSnapshotId,value.supplyCommitmentSnapshotId,value.fulfillmentPlanSnapshotId,value.shipmentNoticeSnapshotId,value.receiptSnapshotId,value.receiptDiscrepancySnapshotId,value.brandId,value.shopId,value.supplierId,value.supplierCode,value.supplierStatus,value.actualCostEntryId,value.sourceRecoveryAmount,value.sourceCurrency,value.recoveryAmount,value.currency,value.landedCostSnapshotId,value.marginActualizationSnapshotId,value.costCloseSnapshotId,value.postCloseAdjustmentId,value.reason,value.status,value.recordedAt,value.contentHash,JSON.stringify(value)]); } catch (error) { if (error?.code==='23505') invariant(false,'SUPPLIER_RECOVERY_ALREADY_RECORDED','Supplier recovery fact already exists',{claimResolutionSnapshotId:value.claimResolutionSnapshotId,supplierCode:value.supplierCode}); throw error; } },
    async getRecovery(id, actorId) {
      const r = await client.query(
        `SELECT recovery.payload
           FROM supplier_claim_recovery_snapshots AS recovery
          WHERE recovery.id = $1
            AND EXISTS (
              SELECT 1
                FROM memberships AS membership
               WHERE membership.organisation_id = recovery.brand_id
                 AND membership.user_id = $2
                 AND membership.status = 'active'
            )
          FOR SHARE OF recovery`,
        [id, actorId],
      );
      return r.rows[0]?.payload;
    },
    getCommand: (id) => getRegisteredCommand(client,'wholesale',id),
    insertCommand: (value) => insertRegisteredCommand(client,'wholesale',value),
    async appendOutbox(event) { await client.query(`INSERT INTO outbox_events (id,event_type,aggregate_id,status,event,published_at) VALUES ($1,$2,$3,'pending',$4::jsonb,NULL)`,[event.id,event.type,event.aggregateId,JSON.stringify(event)]); },
  });
}
async function payloadOne(pool,sql,values){ const r=await pool.query(sql,values); return r.rows[0]?.payload; }
