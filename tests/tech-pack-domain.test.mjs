import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createTechPack,
  createTechPackRevision,
  issueTechPack,
  supersedeTechPack,
  withdrawTechPack,
} from '../src/modules/tech-packs/public.mjs';

const at = '2026-08-04T16:00:00.000Z';
const sku = Object.freeze({ sku: 'STYLE-001', brandId: 'brand-1', status: 'published', version: 3 });
const complete = Object.freeze({
  techPackCode: 'TP-STYLE-001-R01', sku: sku.sku,
  supplierCode: 'FACTORY-01', supplierName: 'Factory One', supplierEmail: 'production@factory.example',
  title: 'Style 001 production pack', description: 'Approved production specification',
  constructionNotes: 'Use locked construction sequence and approved seam allowances.',
  qualityNotes: 'Inspect all critical measurements and workmanship checkpoints.',
  packingNotes: 'Pack individually with size and colour identification.',
});
const dependencies = Object.freeze({
  catalogSku: sku,
  bom: Object.freeze({ id: 'bom-1', sku: sku.sku, brandId: sku.brandId, status: 'published', version: 4 }),
  measurementChart: Object.freeze({ id: 'measurement-1', sku: sku.sku, brandId: sku.brandId, status: 'published', version: 5 }),
  approvedSample: Object.freeze({ sampleCode: 'SMP-STYLE-001-R02', sku: sku.sku, brandId: sku.brandId, status: 'approved', version: 7 }),
});

function draft(overrides = {}) {
  return createTechPack({ id: 'tech-pack-1', catalogSku: sku, createdAt: at, input: { ...complete, ...overrides } });
}

test('Tech Pack issues only when all production dependencies and document sections are complete', () => {
  const value = issueTechPack(draft(), { ...dependencies, actorId: 'owner-1', issuedAt: '2026-08-04T16:10:00.000Z' });
  assert.equal(value.status, 'issued');
  assert.equal(value.version, 2);
  assert.equal(value.issuedBy, 'owner-1');

  assert.throws(() => issueTechPack(draft(), { ...dependencies, approvedSample: { ...dependencies.approvedSample, status: 'rejected' }, actorId: 'owner-1', issuedAt: '2026-08-04T16:10:00.000Z' }), { code: 'TECH_PACK_SAMPLE_NOT_APPROVED' });
  assert.throws(() => issueTechPack(draft(), { ...dependencies, bom: { ...dependencies.bom, status: 'draft' }, actorId: 'owner-1', issuedAt: '2026-08-04T16:10:00.000Z' }), { code: 'TECH_PACK_BOM_NOT_PUBLISHED' });
  assert.throws(() => issueTechPack(draft({ packingNotes: null }), { ...dependencies, actorId: 'owner-1', issuedAt: '2026-08-04T16:10:00.000Z' }), { code: 'TECH_PACK_PACKING_NOTES_REQUIRED' });
});

test('Tech Pack rejects a stale SKU snapshot instead of silently issuing old instructions', () => {
  const changedSku = Object.freeze({ ...sku, version: 4 });
  assert.throws(() => issueTechPack(draft(), { ...dependencies, catalogSku: changedSku, actorId: 'owner-1', issuedAt: '2026-08-04T16:10:00.000Z' }), { code: 'TECH_PACK_SKU_SNAPSHOT_STALE' });
});

test('Tech Pack revision is traceable and the previous issue can be superseded only after issue', () => {
  const issued = issueTechPack(draft(), { ...dependencies, actorId: 'owner-1', issuedAt: '2026-08-04T16:10:00.000Z' });
  const revision = createTechPackRevision({
    id: 'tech-pack-2', issuedTechPack: issued, catalogSku: sku, createdAt: '2026-08-04T16:20:00.000Z',
    input: { techPackCode: 'TP-STYLE-001-R02', constructionNotes: 'Revised approved construction sequence.' },
  });
  assert.equal(revision.status, 'draft');
  assert.equal(revision.revision, 2);
  assert.equal(revision.sourceTechPackCode, issued.techPackCode);
  assert.equal(issued.status, 'issued');

  const superseded = supersedeTechPack(issued, { supersededAt: '2026-08-04T16:30:00.000Z' });
  assert.equal(superseded.status, 'superseded');
  assert.equal(superseded.issuedAt, issued.issuedAt);
});

test('Tech Pack withdrawal requires a reason and closes draft or issued work', () => {
  assert.throws(() => withdrawTechPack(draft(), { reason: 'no', withdrawnAt: '2026-08-04T16:10:00.000Z' }), { code: 'TECH_PACK_WITHDRAWAL_REASON_INVALID' });
  const withdrawn = withdrawTechPack(draft(), { reason: 'Supplier allocation cancelled', withdrawnAt: '2026-08-04T16:10:00.000Z' });
  assert.equal(withdrawn.status, 'withdrawn');
  assert.equal(withdrawn.withdrawalReason, 'Supplier allocation cancelled');
});
