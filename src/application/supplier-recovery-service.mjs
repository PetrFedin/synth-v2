import { domainEvent } from '../core/events.mjs';
import { invariant } from '../core/errors.mjs';
import { canonicalJson, fingerprintsMatch } from '../core/fingerprints.mjs';
import { CAPABILITIES, assertCapability } from '../modules/access-control/public.mjs';
import { createSupplierRecoverySnapshot } from '../modules/receipt-claims/supplier-recovery.mjs';
import { createActualCostLedgerEntry, createLandedCostSnapshot, createMarginActualizationSnapshot, createPostCloseAdjustment } from '../modules/order-economics/public.mjs';

export function createSupplierRecoveryService({ store, clock = () => new Date().toISOString(), nextId = defaultIdGenerator() } = {}) {
  invariant(store && typeof store.transaction === 'function', 'SUPPLIER_RECOVERY_STORE_REQUIRED', 'Supplier recovery store is required');

  async function append(tx,type,aggregateId,payload,commandId,actorId){ await tx.appendOutbox(domainEvent({id:nextId('event'),type,aggregateId,occurredAt:clock(),payload,metadata:{commandId,actorId}})); }

  return Object.freeze({
    recordRecovery(commandId, actorId, resolutionSnapshotId, input) {
      invariant(commandId, 'COMMAND_ID_REQUIRED', 'Every mutation requires commandId');
      invariant(input && typeof input === 'object' && !Array.isArray(input), 'SUPPLIER_RECOVERY_INPUT_REQUIRED', 'Supplier recovery input is required');
      invariant(Number.isFinite(input.amount) && input.amount > 0, 'SUPPLIER_RECOVERY_AMOUNT_INVALID', 'Recovery amount must be positive');
      const fingerprint = `recordSupplierRecovery:${actorId}:${resolutionSnapshotId}:${canonicalJson(input)}`;
      return store.transaction(async (tx) => {
        const previous = await tx.getCommand(commandId);
        if (previous) invariant(fingerprintsMatch(previous.fingerprint,fingerprint),'COMMAND_ID_CONFLICT','commandId was already used by another mutation',{commandId});
        const resolution = requireEntity(await tx.lockResolution(resolutionSnapshotId),'RECEIPT_CLAIM_RESOLUTION_NOT_FOUND',{resolutionSnapshotId});
        const membership = await tx.getMembership(resolution.brandId,actorId);
        assertCapability(membership,CAPABILITIES.COST_MANAGE);
        invariant(membership.organisationId===resolution.brandId,'SUPPLIER_RECOVERY_BRAND_MEMBERSHIP_REQUIRED','Supplier recovery is brand-internal economics',{brandId:resolution.brandId,actorId});
        if (previous) return previous.result;

        const claim = requireEntity(await tx.getClaim(resolution.claimSnapshotId),'RECEIPT_CLAIM_NOT_FOUND',{claimSnapshotId:resolution.claimSnapshotId});
        invariant(claim.contentHash===resolution.claimContentHash,'SUPPLIER_RECOVERY_CLAIM_HASH_MISMATCH','Resolution does not pin the supplied immutable claim');
        if (input.sku != null) invariant(claim.lines.some((line)=>line.sku===input.sku),'SUPPLIER_RECOVERY_SKU_NOT_CLAIMED','SKU recovery must reference an issue SKU in the immutable claim',{sku:input.sku});
        const supplier = requireEntity(await tx.getSupplierByCode(resolution.brandId,input.supplierCode),'SUPPLIER_NOT_FOUND',{supplierCode:input.supplierCode,brandId:resolution.brandId});
        invariant(supplier.brandId===resolution.brandId,'SUPPLIER_RECOVERY_SUPPLIER_MISMATCH','Supplier belongs to another brand',{supplierCode:input.supplierCode});
        invariant(supplier.status!=='draft','SUPPLIER_RECOVERY_SUPPLIER_UNESTABLISHED','Draft supplier cannot be used for recovery',{supplierCode:input.supplierCode});
        const order = requireEntity(await tx.getOrder(resolution.orderId),'ORDER_NOT_FOUND',{orderId:resolution.orderId});
        const orderCommit = requireEntity(await tx.getOrderCommitSnapshot(resolution.orderCommitSnapshotId),'ORDER_COMMIT_SNAPSHOT_NOT_FOUND',{orderCommitSnapshotId:resolution.orderCommitSnapshotId});
        const supplyCommitment = requireEntity(await tx.getSupplyCommitment(resolution.supplyCommitmentSnapshotId),'SUPPLY_COMMITMENT_NOT_FOUND',{supplyCommitmentSnapshotId:resolution.supplyCommitmentSnapshotId});
        const fxRateSnapshot = input.fxRateSnapshotId ? requireEntity(await tx.getFxRateSnapshot(input.fxRateSnapshotId),'FX_RATE_SNAPSHOT_NOT_FOUND',{fxRateSnapshotId:input.fxRateSnapshotId}) : null;
        const costClose = await tx.lockCostLedgerAndGetClose(orderCommit.id);
        const recordedAt = clock();
        const baseCost = createActualCostLedgerEntry({
          id: nextId('actual-cost'), order, orderCommit, supplyCommitment, costType:'quality', amount:-input.amount, currency:input.currency,
          fxRateSnapshot, sku:input.sku??null, sourceRef:input.sourceRef, occurredAt:input.occurredAt, recordedAt,
        });
        const actualCost = Object.freeze({
          ...baseCost, physicalLineageVersion:2,
          fulfillmentPlanSnapshotId:resolution.fulfillmentPlanSnapshotId,
          shipmentNoticeSnapshotId:resolution.shipmentNoticeSnapshotId,
          receiptSnapshotId:resolution.latestReceiptSnapshotId,
          receiptDiscrepancySnapshotId:resolution.receiptDiscrepancySnapshotId,
        });
        await tx.insertPhysicalActualCostEntry(actualCost);
        const entries = (await tx.listActualCostEntries(order.id)).filter((entry)=>entry.orderCommitSnapshotId===orderCommit.id);
        const landedCost = createLandedCostSnapshot({id:nextId('landed-cost'),order,orderCommit,costEntries:entries,createdAt:recordedAt});
        await tx.insertLandedCostSnapshot(landedCost);
        const marginActualization = createMarginActualizationSnapshot({id:nextId('margin-actualization'),order,orderCommit,landedCost,createdAt:recordedAt});
        await tx.insertMarginActualizationSnapshot(marginActualization);

        let postCloseAdjustment = null;
        if (costClose) {
          const previousAdjustment = await tx.getLatestPostCloseAdjustment(costClose.id);
          const priorLandedId = previousAdjustment?.landedCostSnapshotId ?? costClose.landedCostSnapshotId;
          const priorMarginId = previousAdjustment?.marginActualizationSnapshotId ?? costClose.marginActualizationSnapshotId;
          const priorLandedCost = requireEntity(await tx.getLandedCostSnapshot(priorLandedId),'LANDED_COST_SNAPSHOT_NOT_FOUND',{landedCostSnapshotId:priorLandedId});
          const priorMarginActualization = requireEntity(await tx.getMarginActualizationSnapshot(priorMarginId),'MARGIN_ACTUALIZATION_NOT_FOUND',{marginActualizationSnapshotId:priorMarginId});
          postCloseAdjustment = createPostCloseAdjustment({
            id:nextId('post-close-adjustment'),order,orderCommit,costClose,previousAdjustment,actualCostEntry:actualCost,
            priorLandedCost,landedCost,priorMarginActualization,marginActualization,
            reason:`Supplier recovery ${supplier.supplierCode}: ${input.reason}`,recordedAt,
          });
          await tx.insertPostCloseAdjustment(postCloseAdjustment);
        }
        const recovery = createSupplierRecoverySnapshot({id:nextId('supplier-recovery'),resolution,supplier,actualCost,landedCost,marginActualization,costClose,postCloseAdjustment,reason:input.reason,recordedAt});
        await tx.insertRecovery(recovery);

        await append(tx,'actual-cost.recorded',actualCost.id,{orderId:actualCost.orderId,orderCommitSnapshotId:actualCost.orderCommitSnapshotId,supplyCommitmentSnapshotId:actualCost.supplyCommitmentSnapshotId,physicalLineageVersion:2,fulfillmentPlanSnapshotId:actualCost.fulfillmentPlanSnapshotId,shipmentNoticeSnapshotId:actualCost.shipmentNoticeSnapshotId,receiptSnapshotId:actualCost.receiptSnapshotId,receiptDiscrepancySnapshotId:actualCost.receiptDiscrepancySnapshotId,costType:actualCost.costType,amount:actualCost.amount,currency:actualCost.currency,sourceRef:actualCost.sourceRef},commandId,actorId);
        await append(tx,'landed-cost.actualized',landedCost.id,{orderId:landedCost.orderId,orderCommitSnapshotId:landedCost.orderCommitSnapshotId,totalCost:landedCost.totalCost,currency:landedCost.currency,contentHash:landedCost.contentHash,supplierRecoveryId:recovery.id},commandId,actorId);
        await append(tx,'margin.actualized',marginActualization.id,{orderId:marginActualization.orderId,orderCommitSnapshotId:marginActualization.orderCommitSnapshotId,landedCostSnapshotId:landedCost.id,netRevenue:marginActualization.netRevenue,landedCost:marginActualization.landedCost,contributionMarginAmount:marginActualization.contributionMarginAmount,contributionMarginPercent:marginActualization.contributionMarginPercent,contentHash:marginActualization.contentHash,supplierRecoveryId:recovery.id},commandId,actorId);
        if(postCloseAdjustment) await append(tx,'cost-close.adjustment-recorded',postCloseAdjustment.id,{orderId:postCloseAdjustment.orderId,orderCommitSnapshotId:postCloseAdjustment.orderCommitSnapshotId,costCloseSnapshotId:postCloseAdjustment.costCloseSnapshotId,actualCostEntryId:postCloseAdjustment.actualCostEntryId,costDeltaAmount:postCloseAdjustment.costDeltaAmount,marginDeltaAmount:postCloseAdjustment.marginDeltaAmount,supplierRecoveryId:recovery.id},commandId,actorId);
        await append(tx,'supplier-recovery.recorded.v1',recovery.id,{claimResolutionSnapshotId:recovery.claimResolutionSnapshotId,claimSnapshotId:recovery.claimSnapshotId,supplierCode:recovery.supplierCode,sourceRef:recovery.sourceRef,recoveryAmount:recovery.recoveryAmount,currency:recovery.currency,actualCostEntryId:recovery.actualCostEntryId,landedCostSnapshotId:recovery.landedCostSnapshotId,marginActualizationSnapshotId:recovery.marginActualizationSnapshotId,costCloseSnapshotId:recovery.costCloseSnapshotId,postCloseAdjustmentId:recovery.postCloseAdjustmentId,contentHash:recovery.contentHash},commandId,actorId);
        const result=Object.freeze({recovery,actualCost,landedCost,marginActualization,postCloseAdjustment});
        await tx.insertCommand(Object.freeze({id:commandId,fingerprint,actorId,result,completedAt:clock()}));
        return result;
      });
    },

    getRecoveryForActor(actorId,recoveryId){ return store.transaction(async(tx)=>{ const recovery=requireEntity(await tx.getRecovery(recoveryId),'SUPPLIER_RECOVERY_NOT_FOUND',{recoveryId}); const membership=await tx.getMembership(recovery.brandId,actorId); assertCapability(membership,CAPABILITIES.MARGIN_READ); invariant(membership.organisationId===recovery.brandId,'SUPPLIER_RECOVERY_BRAND_MEMBERSHIP_REQUIRED','Supplier recovery is brand-internal economics',{brandId:recovery.brandId,actorId}); return recovery; }); },
  });
}
function requireEntity(entity,code,details){ invariant(entity,code,'Entity not found',details); return entity; }
function defaultIdGenerator(){let sequence=0;return(prefix)=>`${prefix}_${++sequence}`;}
