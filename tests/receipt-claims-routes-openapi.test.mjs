import test from 'node:test';
import assert from 'node:assert/strict';
import { createReceiptClaimsRoutes } from '../src/http/receipt-claims-routes.mjs';
import { wholesaleV2ExtendedOpenApi } from '../src/http/v2-openapi.mjs';

const calls = [];
const receiptClaims = {
  submitClaim: (...args) => { calls.push(['submit', ...args]); return { id: 'claim-1' }; },
  resolveClaim: (...args) => { calls.push(['resolve', ...args]); return { id: 'resolution-1' }; },
  getClaimForActor: (...args) => { calls.push(['get-claim', ...args]); return { id: args[1] }; },
  getResolutionForActor: (...args) => { calls.push(['get-resolution', ...args]); return { id: args[1] }; },
};
function findRoute(routes, method, path) { return routes.find((route) => route.method === method && route.pattern.test(path)); }

test('receipt claim routes expose submit, resolve and bilateral reads', async () => {
  const routes = createReceiptClaimsRoutes({ receiptClaims });
  const submit = findRoute(routes, 'POST', '/v2/receipt-discrepancies/disc-1/claims');
  assert.ok(submit?.mutation);
  await submit.execute({ commandId: 'cmd-submit', actorId: 'buyer-1', params: ['disc-1'], query: {}, body: { claimReference: 'CLAIM-1', reason: 'Damage', requestedRemedy: 'credit' } });
  assert.equal(calls.at(-1)[0], 'submit');
  const resolve = findRoute(routes, 'POST', '/v2/receipt-claims/claim-1/resolutions');
  assert.ok(resolve?.mutation);
  await resolve.execute({ commandId: 'cmd-resolve', actorId: 'sales-1', params: ['claim-1'], query: {}, body: { resolutionType: 'accepted-for-credit', resolutionReason: 'Accepted' } });
  assert.equal(calls.at(-1)[0], 'resolve');
  assert.ok(findRoute(routes, 'GET', '/v2/receipt-claims/claim-1'));
  assert.ok(findRoute(routes, 'GET', '/v2/receipt-claim-resolutions/resolution-1'));
});

test('receipt claim transport rejects monetary or issue-line mutation fields', () => {
  const routes = createReceiptClaimsRoutes({ receiptClaims });
  const submit = findRoute(routes, 'POST', '/v2/receipt-discrepancies/disc-1/claims');
  assert.throws(() => submit.execute({ commandId: 'cmd', actorId: 'buyer-1', params: ['disc-1'], query: {}, body: { claimReference: 'CLAIM-1', reason: 'Damage', requestedRemedy: 'credit', amount: 100 } }), (error) => error.code === 'HTTP_BODY_FIELD_UNKNOWN');
  const resolve = findRoute(routes, 'POST', '/v2/receipt-claims/claim-1/resolutions');
  assert.throws(() => resolve.execute({ commandId: 'cmd', actorId: 'sales-1', params: ['claim-1'], query: {}, body: { resolutionType: 'accepted-for-credit', resolutionReason: 'Accepted', supplierCode: 'SUP-1' } }), (error) => error.code === 'HTTP_BODY_FIELD_UNKNOWN');
});

test('authoritative OpenAPI exposes claim snapshots without version drift or settlement coupling', () => {
  assert.equal(wholesaleV2ExtendedOpenApi.info.version, '1.17.0');
  for (const path of [
    '/receipt-discrepancies/{receiptDiscrepancySnapshotId}/claims',
    '/receipt-claims/{claimSnapshotId}',
    '/receipt-claims/{claimSnapshotId}/resolutions',
    '/receipt-claim-resolutions/{resolutionSnapshotId}',
  ]) assert.ok(wholesaleV2ExtendedOpenApi.paths[path], `missing ${path}`);
  const claim = wholesaleV2ExtendedOpenApi.components.schemas.ReceiptDiscrepancyClaimSnapshot;
  assert.ok(claim.required.includes('receiptDiscrepancyContentHash'));
  assert.ok(claim.required.includes('lines'));
  assert.equal(Object.hasOwn(claim.properties, 'amount'), false);
  const resolution = wholesaleV2ExtendedOpenApi.components.schemas.ReceiptClaimResolutionSnapshot;
  assert.ok(resolution.required.includes('claimContentHash'));
  assert.equal(Object.hasOwn(resolution.properties, 'supplierCode'), false);
});
