import test from 'node:test';
import assert from 'node:assert/strict';
import { createReceiptClaimsService } from '../src/application/receipt-claims-service.mjs';

function fixture() {
  const discrepancy = Object.freeze({
    id: 'disc-1', orderId: 'order-1', orderVersion: 2, orderCommitSnapshotId: 'commit-1', supplyCommitmentSnapshotId: 'supply-1',
    fulfillmentPlanSnapshotId: 'plan-1', shipmentNoticeSnapshotId: 'asn-1', latestReceiptSnapshotId: 'receipt-1',
    brandId: 'brand-1', shopId: 'shop-1', finalized: true, status: 'open', issueCount: 1, contentHash: 'a'.repeat(64),
    lines: [{ lineId: 'line-1', sku: 'SKU-A', shippedQuantity: 10, receivedQuantity: 10, acceptedQuantity: 8, damagedQuantity: 1, rejectedQuantity: 1, shortageQuantity: 0, overageQuantity: 0 }],
  });
  const state = {
    discrepancy,
    memberships: new Map([
      ['shop-1:buyer-1', { id: 'm-buyer', organisationId: 'shop-1', organisationType: 'shop', userId: 'buyer-1', role: 'buyer', status: 'active' }],
      ['shop-1:shop-finance', { id: 'm-shop-finance', organisationId: 'shop-1', organisationType: 'shop', userId: 'shop-finance', role: 'finance', status: 'active' }],
      ['brand-1:sales-1', { id: 'm-sales', organisationId: 'brand-1', organisationType: 'brand', userId: 'sales-1', role: 'sales', status: 'active' }],
      ['brand-1:brand-finance', { id: 'm-finance', organisationId: 'brand-1', organisationType: 'brand', userId: 'brand-finance', role: 'finance', status: 'active' }],
    ]),
    claims: [], resolutions: [], commands: new Map(), outbox: [],
  };
  const tx = {
    getCommand: async (id) => state.commands.get(id), insertCommand: async (value) => state.commands.set(value.id, value),
    getMembership: async (orgId, actorId) => state.memberships.get(`${orgId}:${actorId}`),
    lockDiscrepancy: async (id) => id === discrepancy.id ? discrepancy : undefined,
    getClaimByDiscrepancy: async (id) => state.claims.find((claim) => claim.receiptDiscrepancySnapshotId === id),
    insertClaim: async (claim) => state.claims.push(claim),
    getClaim: async (id) => state.claims.find((claim) => claim.id === id),
    lockClaim: async (id) => state.claims.find((claim) => claim.id === id),
    getResolutionByClaim: async (id) => state.resolutions.find((resolution) => resolution.claimSnapshotId === id),
    insertResolution: async (resolution) => state.resolutions.push(resolution),
    getResolution: async (id) => state.resolutions.find((resolution) => resolution.id === id),
    appendOutbox: async (event) => state.outbox.push(event),
  };
  let seq = 0;
  const service = createReceiptClaimsService({ store: { transaction: async (work) => work(tx) }, clock: () => '2026-08-10T12:00:00.000Z', nextId: (prefix) => `${prefix}-${++seq}` });
  return { state, service };
}

const submitInput = { claimReference: 'CLAIM-100', reason: 'Damaged at receipt', requestedRemedy: 'credit' };

test('shop buyer submits and brand sales resolves immutable claim', async () => {
  const { state, service } = fixture();
  const claim = await service.submitClaim('cmd-submit', 'buyer-1', 'disc-1', submitInput);
  assert.equal(claim.shopId, 'shop-1');
  assert.equal(claim.issueCount, 1);
  assert.equal(state.outbox[0].type, 'receipt-claim.submitted.v1');
  const resolution = await service.resolveClaim('cmd-resolve', 'sales-1', claim.id, { resolutionType: 'accepted-for-credit', resolutionReason: 'Evidence accepted' });
  assert.equal(resolution.claimSnapshotId, claim.id);
  assert.equal(resolution.brandId, 'brand-1');
  assert.equal(state.outbox.at(-1).type, 'receipt-claim.resolved.v1');
});

test('submit and resolve replays are idempotent but business duplicates are rejected', async () => {
  const { state, service } = fixture();
  const claim = await service.submitClaim('cmd-submit', 'buyer-1', 'disc-1', submitInput);
  assert.equal((await service.submitClaim('cmd-submit', 'buyer-1', 'disc-1', submitInput)).id, claim.id);
  await assert.rejects(service.submitClaim('cmd-submit-2', 'buyer-1', 'disc-1', { ...submitInput, claimReference: 'CLAIM-101' }), (error) => error.code === 'RECEIPT_CLAIM_ALREADY_EXISTS');
  const resolution = await service.resolveClaim('cmd-resolve', 'sales-1', claim.id, { resolutionType: 'accepted-for-credit', resolutionReason: 'Evidence accepted' });
  assert.equal((await service.resolveClaim('cmd-resolve', 'sales-1', claim.id, { resolutionType: 'accepted-for-credit', resolutionReason: 'Evidence accepted' })).id, resolution.id);
  await assert.rejects(service.resolveClaim('cmd-resolve-2', 'sales-1', claim.id, { resolutionType: 'rejected', resolutionReason: 'Second answer' }), (error) => error.code === 'RECEIPT_CLAIM_ALREADY_RESOLVED');
  assert.equal(state.claims.length, 1);
  assert.equal(state.resolutions.length, 1);
});

test('segregation of duties prevents brand submit and shop resolve while both sides can read', async () => {
  const { service } = fixture();
  await assert.rejects(service.submitClaim('cmd-brand-submit', 'sales-1', 'disc-1', submitInput), (error) => error.code === 'ACTIVE_MEMBERSHIP_REQUIRED');
  const claim = await service.submitClaim('cmd-submit', 'buyer-1', 'disc-1', submitInput);
  await assert.rejects(service.resolveClaim('cmd-shop-resolve', 'buyer-1', claim.id, { resolutionType: 'accepted-for-credit', resolutionReason: 'Not allowed' }), (error) => error.code === 'ACTIVE_MEMBERSHIP_REQUIRED');
  assert.equal((await service.getClaimForActor('buyer-1', claim.id)).id, claim.id);
  assert.equal((await service.getClaimForActor('sales-1', claim.id)).id, claim.id);
  assert.equal((await service.getClaimForActor('shop-finance', claim.id)).id, claim.id);
  assert.equal((await service.getClaimForActor('brand-finance', claim.id)).id, claim.id);
});

test('idempotent replay re-authorizes current membership', async () => {
  const { state, service } = fixture();
  await service.submitClaim('cmd-submit', 'buyer-1', 'disc-1', submitInput);
  state.memberships.set('shop-1:buyer-1', { ...state.memberships.get('shop-1:buyer-1'), status: 'revoked' });
  await assert.rejects(service.submitClaim('cmd-submit', 'buyer-1', 'disc-1', submitInput), (error) => error.code === 'ACTIVE_MEMBERSHIP_REQUIRED');
});
