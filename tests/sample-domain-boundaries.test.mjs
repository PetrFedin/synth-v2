import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cancelSample,
  createNextSampleRound,
  createSample,
  decideSample,
  receiveSample,
  requestSample,
  updateDraftSample,
} from '../src/modules/samples/public.mjs';

const catalogSku = Object.freeze({ sku: 'STYLE-BOUNDARY', brandId: 'brand-1', status: 'published', version: 3 });
const input = Object.freeze({
  sampleCode: 'SMP-STYLE-BOUNDARY-FIT-R01', sku: catalogSku.sku, sampleType: 'fit', round: 1,
  supplierCode: 'FACTORY-1', supplierName: 'Factory One', dueAt: '2026-08-20T12:00:00.000Z',
  quantity: 1, sizeCodes: Object.freeze(['M']), colourway: 'Black', notes: 'Original correction note',
});
const create = () => createSample({ id: 'sample-1', catalogSku, input, createdAt: '2026-08-04T10:00:00.000Z' });
const editable = (notes = input.notes) => ({
  supplierCode: input.supplierCode, supplierName: input.supplierName, dueAt: input.dueAt,
  quantity: input.quantity, sizeCodes: input.sizeCodes, colourway: input.colourway, notes,
});

function rejectedSample() {
  const requested = requestSample(create(), { catalogSku, requestedAt: '2026-08-04T11:00:00.000Z' });
  const received = receiveSample(requested, {
    input: { receivedQuantity: 1, condition: 'accepted', trackingReference: null, notes: null },
    receivedAt: '2026-08-12T09:00:00.000Z',
  });
  return decideSample(received, {
    input: { decision: 'rejected', notes: 'Balance is outside tolerance' }, actorId: 'user-1',
    decidedAt: '2026-08-12T10:00:00.000Z',
  });
}

test('domain rejects timestamps that move the aggregate backwards', () => {
  const draft = create();
  assert.throws(() => updateDraftSample(draft, {
    catalogSku, input: editable('Changed'), updatedAt: '2026-08-04T09:59:59.000Z',
  }), { code: 'SAMPLE_TIME_ORDER_INVALID' });

  const requested = requestSample(draft, { catalogSku, requestedAt: '2026-08-04T11:00:00.000Z' });
  assert.throws(() => cancelSample(requested, {
    reason: 'Supplier cannot meet the approved calendar', cancelledAt: '2026-08-04T10:30:00.000Z',
  }), { code: 'SAMPLE_TIME_ORDER_INVALID' });

  const rejected = rejectedSample();
  assert.throws(() => createNextSampleRound({
    id: 'sample-2', rejectedSample: rejected, catalogSku,
    input: { sampleCode: 'SMP-STYLE-BOUNDARY-FIT-R02', dueAt: '2026-08-28T12:00:00.000Z' },
    createdAt: '2026-08-12T09:59:59.000Z',
  }), { code: 'SAMPLE_TIME_ORDER_INVALID' });
});

test('next round distinguishes omitted notes from an explicit null', () => {
  const rejected = rejectedSample();
  const inherited = createNextSampleRound({
    id: 'sample-2', rejectedSample: rejected, catalogSku,
    input: { sampleCode: 'SMP-STYLE-BOUNDARY-FIT-R02', dueAt: '2026-08-28T12:00:00.000Z' },
    createdAt: '2026-08-12T11:00:00.000Z',
  });
  assert.equal(inherited.notes, rejected.notes);

  const cleared = createNextSampleRound({
    id: 'sample-3', rejectedSample: rejected, catalogSku,
    input: { sampleCode: 'SMP-STYLE-BOUNDARY-FIT-R03', dueAt: '2026-08-29T12:00:00.000Z', notes: null },
    createdAt: '2026-08-12T11:00:00.000Z',
  });
  assert.equal(cleared.notes, null);
});
