import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = await readFile(path.join(root, 'public', 'modules', 'sample-core.js'), 'utf8');
const context = vm.createContext({ window: {} });
vm.runInContext(source, context, { filename: 'sample-core.js' });
const core = context.window.SynthaSampleCore;
const plain = (value) => JSON.parse(JSON.stringify(value));

const base = Object.freeze({
  sampleCode: 'SMP-STYLE-100-FIT-R01', sku: 'STYLE-100', brandId: 'brand-1', skuVersion: 7,
  sampleType: 'fit', round: 1, status: 'draft', supplierCode: 'FACTORY-1', supplierName: 'Factory One',
  dueAt: '2026-08-20T12:00:00.000Z', quantity: 1, sizeCodes: ['M'],
});
const publishedSku = Object.freeze({ sku: 'STYLE-100', brandId: 'brand-1', version: 7, status: 'published' });

test('Samples UI core mirrors the server lifecycle and least privilege', () => {
  assert.deepEqual(plain(core.allowedActions(base, { canManage: true })), ['edit', 'request', 'cancel']);
  assert.deepEqual(plain(core.allowedActions({ ...base, status: 'requested' }, { canManage: true })), ['start-production', 'receive', 'cancel']);
  assert.deepEqual(plain(core.allowedActions({ ...base, status: 'in-production' }, { canManage: true })), ['receive', 'cancel']);
  assert.deepEqual(plain(core.allowedActions({ ...base, status: 'received' }, { canManage: true })), ['approve', 'reject']);
  assert.deepEqual(plain(core.allowedActions({ ...base, status: 'rejected' }, { canManage: true })), ['next-round']);
  assert.deepEqual(plain(core.allowedActions({ ...base, status: 'approved' }, { canManage: true })), []);
  assert.deepEqual(plain(core.allowedActions(base, { canManage: false })), []);
});

test('overdue and request blockers use one stable reference time', () => {
  const asOf = '2026-08-21T12:00:00.000Z';
  assert.equal(core.isOverdue({ ...base, status: 'requested' }, asOf), true);
  assert.equal(core.isOverdue({ ...base, status: 'received' }, asOf), false);
  assert.deepEqual(plain(core.assess(base, publishedSku, '2026-08-04T12:00:00.000Z').requestIssues), []);
  const blocked = core.assess({ ...base, supplierCode: null, supplierName: null }, { ...publishedSku, version: 8, status: 'draft' }, asOf);
  assert.deepEqual(plain(blocked.requestIssues), [
    'SAMPLE_SKU_NOT_PUBLISHED', 'SAMPLE_SKU_SNAPSHOT_STALE', 'SAMPLE_SUPPLIER_REQUIRED', 'SAMPLE_DUE_AT_NOT_FUTURE',
  ]);
});

test('summary and next-round code are deterministic', () => {
  const samples = [
    { ...base, status: 'requested' },
    { ...base, sampleCode: 'SMP-STYLE-100-FIT-R02', round: 2, status: 'received' },
    { ...base, sampleCode: 'SMP-STYLE-100-FIT-R03', round: 3, status: 'approved', skuVersion: 6 },
    { ...base, sampleCode: 'SMP-STYLE-100-FIT-R04', round: 4, status: 'rejected' },
  ];
  assert.deepEqual(plain(core.summarize(samples, new Map([[publishedSku.sku, publishedSku]]), '2026-08-21T12:00:00.000Z')), {
    total: 4, active: 2, overdue: 1, review: 1, approved: 1, rejected: 1, stale: 1,
  });
  assert.equal(core.nextRoundCode(samples[3]), 'SMP-STYLE-100-FIT-R05');
});
