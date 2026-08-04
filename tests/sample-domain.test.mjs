import test from 'node:test';
import assert from 'node:assert/strict';
import { cancelSample, createNextSampleRound, createSample, decideSample, receiveSample, requestSample, startSampleProduction, updateDraftSample } from '../src/modules/samples/public.mjs';

const catalogSku = Object.freeze({ sku: 'STYLE-100', brandId: 'brand-1', status: 'published', version: 7 });
const input = Object.freeze({ sampleCode: 'SMP-STYLE-100-FIT-R01', sku: catalogSku.sku, sampleType: 'fit', round: 1, supplierCode: 'FACTORY-01', supplierName: 'Factory One', dueAt: '2026-08-20T12:00:00.000Z', quantity: 2, sizeCodes: Object.freeze(['S', 'M']), colourway: 'Black', notes: 'First fit round' });
function create(overrides = {}) { return createSample({ id: 'sample-1', catalogSku, input: { ...input, ...overrides }, createdAt: '2026-08-04T10:00:00.000Z' }); }

test('creates an immutable draft bound to the exact SKU snapshot', () => {
  const sample = create();
  assert.equal(sample.status, 'draft');
  assert.equal(sample.version, 1);
  assert.equal(sample.skuVersion, 7);
  assert.deepEqual(sample.sizeCodes, ['S', 'M']);
  assert.ok(Object.isFrozen(sample));
  assert.ok(Object.isFrozen(sample.sizeCodes));
});

test('rebases only editable draft fields and preserves immutable identity', () => {
  const sample = create();
  const updated = updateDraftSample(sample, { catalogSku: { ...catalogSku, version: 8 }, input: { supplierCode: 'FACTORY-02', supplierName: 'Factory Two', dueAt: input.dueAt, quantity: 2, sizeCodes: ['S', 'M'], colourway: 'Navy', notes: null }, updatedAt: '2026-08-04T11:00:00.000Z' });
  assert.equal(updated.id, sample.id);
  assert.equal(updated.sampleCode, sample.sampleCode);
  assert.equal(updated.sampleType, sample.sampleType);
  assert.equal(updated.round, sample.round);
  assert.equal(updated.skuVersion, 8);
  assert.equal(updated.version, 2);
  assert.equal(updateDraftSample(updated, { catalogSku: { ...catalogSku, version: 8 }, input: { supplierCode: 'FACTORY-02', supplierName: 'Factory Two', dueAt: input.dueAt, quantity: 2, sizeCodes: ['S', 'M'], colourway: 'Navy', notes: null }, updatedAt: '2026-08-04T12:00:00.000Z' }), updated);
});

test('completes request, production, receipt and approval with strict ordering', () => {
  const requested = requestSample(create(), { catalogSku, requestedAt: '2026-08-04T11:00:00.000Z' });
  const production = startSampleProduction(requested, { startedAt: '2026-08-05T09:00:00.000Z' });
  const received = receiveSample(production, { input: { receivedQuantity: 2, condition: 'accepted', trackingReference: 'TRACK-1', notes: null }, receivedAt: '2026-08-12T09:00:00.000Z' });
  const approved = decideSample(received, { input: { decision: 'approved', notes: 'Fit approved' }, actorId: 'user-1', decidedAt: '2026-08-12T10:00:00.000Z' });
  assert.deepEqual([requested.status, production.status, received.status, approved.status], ['requested', 'in-production', 'received', 'approved']);
  assert.equal(approved.version, 5);
  assert.equal(approved.decision.actorId, 'user-1');
  assert.throws(() => cancelSample(received, { reason: 'Too late to cancel', cancelledAt: '2026-08-12T10:00:00.000Z' }), { code: 'SAMPLE_NOT_CANCELLABLE' });
});

test('blocks stale requests, incomplete receipt and rejection without evidence', () => {
  assert.throws(() => requestSample(create(), { catalogSku: { ...catalogSku, version: 8 }, requestedAt: '2026-08-04T11:00:00.000Z' }), { code: 'SAMPLE_SKU_SNAPSHOT_STALE' });
  const requested = requestSample(create(), { catalogSku, requestedAt: '2026-08-04T11:00:00.000Z' });
  assert.throws(() => receiveSample(requested, { input: { receivedQuantity: 1, condition: 'accepted', trackingReference: null, notes: null }, receivedAt: '2026-08-12T09:00:00.000Z' }), { code: 'SAMPLE_RECEIPT_INCOMPLETE' });
  const received = receiveSample(requested, { input: { receivedQuantity: 2, condition: 'damaged', trackingReference: null, notes: 'Damage on arrival' }, receivedAt: '2026-08-12T09:00:00.000Z' });
  assert.throws(() => decideSample(received, { input: { decision: 'rejected', notes: null }, actorId: 'user-1', decidedAt: '2026-08-12T10:00:00.000Z' }), { code: 'SAMPLE_REJECTION_NOTES_REQUIRED' });
});

test('rejected sample creates exactly the next traceable round draft', () => {
  const requested = requestSample(create(), { catalogSku, requestedAt: '2026-08-04T11:00:00.000Z' });
  const received = receiveSample(requested, { input: { receivedQuantity: 2, condition: 'accepted', trackingReference: null, notes: null }, receivedAt: '2026-08-12T09:00:00.000Z' });
  const rejected = decideSample(received, { input: { decision: 'rejected', notes: 'Chest grading is outside tolerance' }, actorId: 'user-1', decidedAt: '2026-08-12T10:00:00.000Z' });
  const next = createNextSampleRound({ id: 'sample-2', rejectedSample: rejected, catalogSku: { ...catalogSku, version: 8 }, input: { sampleCode: 'SMP-STYLE-100-FIT-R02', dueAt: '2026-08-28T12:00:00.000Z', notes: 'Correct chest grading' }, createdAt: '2026-08-12T11:00:00.000Z' });
  assert.equal(next.status, 'draft');
  assert.equal(next.round, 2);
  assert.equal(next.sourceSampleCode, rejected.sampleCode);
  assert.equal(next.skuVersion, 8);
  assert.equal(next.supplierCode, rejected.supplierCode);
});

test('cancellation is terminal and requires an actionable reason', () => {
  const requested = requestSample(create(), { catalogSku, requestedAt: '2026-08-04T11:00:00.000Z' });
  assert.throws(() => cancelSample(requested, { reason: 'no', cancelledAt: '2026-08-05T09:00:00.000Z' }), { code: 'SAMPLE_CANCELLATION_REASON_INVALID' });
  const cancelled = cancelSample(requested, { reason: 'Supplier cannot meet the required date', cancelledAt: '2026-08-05T09:00:00.000Z' });
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(cancelled.version, 3);
  assert.throws(() => startSampleProduction(cancelled, { startedAt: '2026-08-06T09:00:00.000Z' }), { code: 'SAMPLE_NOT_REQUESTED' });
});

test('rejects duplicate sizes, unsupported fields and round overflow', () => {
  assert.throws(() => create({ sizeCodes: ['M', 'M'] }), { code: 'SAMPLE_SIZE_CODE_DUPLICATE' });
  assert.throws(() => create({ round: 101 }), { code: 'SAMPLE_ROUND_INVALID' });
  assert.throws(() => createSample({ id: 'sample-1', catalogSku, input: { ...input, version: 99 }, createdAt: '2026-08-04T10:00:00.000Z' }), { code: 'SAMPLE_FIELD_FORBIDDEN' });
});
