import { domainEvent } from '../core/events.mjs';
import { invariant } from '../core/errors.mjs';
import { canonicalJson, fingerprintsMatch } from '../core/fingerprints.mjs';
import { CAPABILITIES, assertCapability } from '../modules/access-control/public.mjs';
import { createReceiptClaimResolutionSnapshot, createReceiptDiscrepancyClaimSnapshot } from '../modules/receipt-claims/public.mjs';

export function createReceiptClaimsService({ store, clock = () => new Date().toISOString(), nextId = defaultIdGenerator() } = {}) {
  invariant(store && typeof store.transaction === 'function', 'RECEIPT_CLAIMS_STORE_REQUIRED', 'Receipt claims store is required');

  async function append(tx, type, aggregateId, payload, commandId, actorId) {
    await tx.appendOutbox(domainEvent({ id: nextId('event'), type, aggregateId, occurredAt: clock(), payload, metadata: { commandId, actorId } }));
  }

  async function authorizeTradeRead(tx, actorId, value) {
    const brandMembership = await tx.getMembership(value.brandId, actorId);
    if (brandMembership?.status === 'active') {
      assertCapability(brandMembership, CAPABILITIES.CLAIM_READ);
      return brandMembership;
    }
    const shopMembership = await tx.getMembership(value.shopId, actorId);
    assertCapability(shopMembership, CAPABILITIES.CLAIM_READ);
    invariant(shopMembership.organisationId === value.shopId, 'RECEIPT_CLAIM_TRADE_MEMBERSHIP_REQUIRED', 'Actor must belong to the claim trade pair');
    return shopMembership;
  }

  return Object.freeze({
    submitClaim(commandId, actorId, receiptDiscrepancySnapshotId, input) {
      invariant(commandId, 'COMMAND_ID_REQUIRED', 'Every mutation requires commandId');
      const fingerprint = `submitReceiptClaim:${actorId}:${receiptDiscrepancySnapshotId}:${canonicalJson(input)}`;
      return store.transaction(async (tx) => {
        const previous = await tx.getCommand(commandId);
        if (previous) invariant(fingerprintsMatch(previous.fingerprint, fingerprint), 'COMMAND_ID_CONFLICT', 'commandId was already used by another mutation', { commandId });
        const discrepancy = requireEntity(await tx.lockDiscrepancy(receiptDiscrepancySnapshotId, actorId), 'RECEIPT_DISCREPANCY_NOT_FOUND', { receiptDiscrepancySnapshotId });
        const membership = await tx.getMembership(discrepancy.shopId, actorId);
        assertCapability(membership, CAPABILITIES.CLAIM_MANAGE);
        invariant(membership.organisationId === discrepancy.shopId, 'RECEIPT_CLAIM_SHOP_MEMBERSHIP_REQUIRED', 'Only the receiving retailer can submit the discrepancy claim', { shopId: discrepancy.shopId, actorId });
        if (previous) return previous.result;
        const existing = await tx.getClaimByDiscrepancy(discrepancy.id);
        invariant(!existing, 'RECEIPT_CLAIM_ALREADY_EXISTS', 'Receipt discrepancy already has an immutable claim', { receiptDiscrepancySnapshotId: discrepancy.id, claimSnapshotId: existing?.id });
        const claim = createReceiptDiscrepancyClaimSnapshot({ id: nextId('receipt-claim'), discrepancy, claimReference: input.claimReference, reason: input.reason, requestedRemedy: input.requestedRemedy, submittedAt: clock() });
        await tx.insertClaim(claim);
        await append(tx, 'receipt-claim.submitted.v1', claim.id, {
          receiptDiscrepancySnapshotId: claim.receiptDiscrepancySnapshotId, orderCommitSnapshotId: claim.orderCommitSnapshotId,
          shipmentNoticeSnapshotId: claim.shipmentNoticeSnapshotId, latestReceiptSnapshotId: claim.latestReceiptSnapshotId,
          brandId: claim.brandId, shopId: claim.shopId, requestedRemedy: claim.requestedRemedy, issueCount: claim.issueCount, contentHash: claim.contentHash,
        }, commandId, actorId);
        await tx.insertCommand(Object.freeze({ id: commandId, fingerprint, actorId, result: claim, completedAt: clock() }));
        return claim;
      });
    },

    resolveClaim(commandId, actorId, claimSnapshotId, input) {
      invariant(commandId, 'COMMAND_ID_REQUIRED', 'Every mutation requires commandId');
      const fingerprint = `resolveReceiptClaim:${actorId}:${claimSnapshotId}:${canonicalJson(input)}`;
      return store.transaction(async (tx) => {
        const previous = await tx.getCommand(commandId);
        if (previous) invariant(fingerprintsMatch(previous.fingerprint, fingerprint), 'COMMAND_ID_CONFLICT', 'commandId was already used by another mutation', { commandId });
        const claim = requireEntity(await tx.lockClaim(claimSnapshotId, actorId), 'RECEIPT_CLAIM_NOT_FOUND', { claimSnapshotId });
        const membership = await tx.getMembership(claim.brandId, actorId);
        assertCapability(membership, CAPABILITIES.CLAIM_RESOLVE);
        invariant(membership.organisationId === claim.brandId, 'RECEIPT_CLAIM_BRAND_MEMBERSHIP_REQUIRED', 'Only the selling brand can resolve the receipt claim', { brandId: claim.brandId, actorId });
        if (previous) return previous.result;
        const existing = await tx.getResolutionByClaim(claim.id);
        invariant(!existing, 'RECEIPT_CLAIM_ALREADY_RESOLVED', 'Receipt claim already has an immutable resolution', { claimSnapshotId: claim.id, resolutionSnapshotId: existing?.id });
        const resolution = createReceiptClaimResolutionSnapshot({ id: nextId('receipt-claim-resolution'), claim, resolutionType: input.resolutionType, resolutionReason: input.resolutionReason, resolvedAt: clock() });
        await tx.insertResolution(resolution);
        await append(tx, 'receipt-claim.resolved.v1', resolution.id, {
          claimSnapshotId: resolution.claimSnapshotId, receiptDiscrepancySnapshotId: resolution.receiptDiscrepancySnapshotId,
          orderCommitSnapshotId: resolution.orderCommitSnapshotId, brandId: resolution.brandId, shopId: resolution.shopId,
          resolutionType: resolution.resolutionType, contentHash: resolution.contentHash,
        }, commandId, actorId);
        await tx.insertCommand(Object.freeze({ id: commandId, fingerprint, actorId, result: resolution, completedAt: clock() }));
        return resolution;
      });
    },

    getClaimForActor(actorId, claimSnapshotId) {
      return store.transaction(async (tx) => {
        const claim = requireEntity(await tx.getClaim(claimSnapshotId, actorId), 'RECEIPT_CLAIM_NOT_FOUND', { claimSnapshotId });
        await authorizeTradeRead(tx, actorId, claim);
        return claim;
      });
    },

    getResolutionForActor(actorId, resolutionSnapshotId) {
      return store.transaction(async (tx) => {
        const resolution = requireEntity(await tx.getResolution(resolutionSnapshotId, actorId), 'RECEIPT_CLAIM_RESOLUTION_NOT_FOUND', { resolutionSnapshotId });
        await authorizeTradeRead(tx, actorId, resolution);
        return resolution;
      });
    },
  });
}

function requireEntity(entity, code, details) { invariant(entity, code, 'Entity not found', details); return entity; }
function defaultIdGenerator() { let sequence = 0; return (prefix) => `${prefix}_${++sequence}`; }
