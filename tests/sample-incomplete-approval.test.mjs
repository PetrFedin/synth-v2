import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createSample, decideSample, receiveSample, requestSample } from '../src/modules/samples/public.mjs';

const catalogSku = Object.freeze({ sku: 'STYLE-INCOMPLETE', brandId: 'brand-1', status: 'published', version: 1 });
const draft = createSample({
  id: 'sample-incomplete-1', catalogSku, createdAt: '2026-08-04T10:00:00.000Z',
  input: {
    sampleCode: 'SMP-STYLE-INCOMPLETE-FIT-R01', sku: catalogSku.sku, sampleType: 'fit', round: 1,
    supplierCode: 'FACTORY-1', supplierName: 'Factory One', dueAt: '2026-08-20T12:00:00.000Z',
    quantity: 1, sizeCodes: ['M'], colourway: 'Black', notes: null,
  },
});

test('incomplete receipt cannot be approved but can be rejected with evidence', () => {
  const requested = requestSample(draft, { catalogSku, requestedAt: '2026-08-04T11:00:00.000Z' });
  const received = receiveSample(requested, {
    input: { receivedQuantity: 1, condition: 'incomplete', trackingReference: 'TRACK-INCOMPLETE', notes: 'Missing trim card' },
    receivedAt: '2026-08-12T09:00:00.000Z',
  });
  assert.throws(() => decideSample(received, {
    input: { decision: 'approved', notes: 'Approve anyway' }, actorId: 'owner-1', decidedAt: '2026-08-12T10:00:00.000Z',
  }), { code: 'SAMPLE_INCOMPLETE_CANNOT_BE_APPROVED' });
  assert.equal(received.status, 'received');
  assert.equal(received.version, 3);

  const rejected = decideSample(received, {
    input: { decision: 'rejected', notes: 'Missing trim card must be supplied' }, actorId: 'owner-1', decidedAt: '2026-08-12T10:00:00.000Z',
  });
  assert.equal(rejected.status, 'rejected');
});

test('V9 UI exposes only rejection for an incomplete received sample', async () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const source = await readFile(path.join(root, 'public', 'modules', 'sample-core.js'), 'utf8');
  const context = vm.createContext({ window: {} });
  vm.runInContext(source, context, { filename: 'sample-core.js' });
  const actions = JSON.parse(JSON.stringify(context.window.SynthaSampleCore.allowedActions({
    status: 'received', receipt: { condition: 'incomplete' },
  }, { canManage: true })));
  assert.deepEqual(actions, ['reject']);
});
