import test from 'node:test';
import assert from 'node:assert/strict';
import {
  acknowledgeTechPack,
  createTechPack,
  createTechPackRevision,
  issueTechPack,
  supersedeTechPack,
  withdrawTechPack,
} from '../src/modules/tech-packs/public.mjs';

const sku = Object.freeze({ sku: 'STYLE-001', brandId: 'brand-1', status: 'published', version: 3 });
const dependencies = Object.freeze({
  catalogSku: sku,
  bom: Object.freeze({ id: 'bom-1', sku: sku.sku, brandId: sku.brandId, status: 'published', version: 4 }),
  measurementChart: Object.freeze({ id: 'measurement-1', sku: sku.sku, brandId: sku.brandId, status: 'published', version: 5 }),
  approvedSample: Object.freeze({ sampleCode: 'SMP-STYLE-001-R02', sku: sku.sku, brandId: sku.brandId, status: 'approved', version: 7 }),
});
const complete = Object.freeze({
  techPackCode: 'TP-STYLE-001-R01', sku: sku.sku,
  supplierCode: 'FACTORY-01', supplierName: 'Factory One', supplierEmail: 'production@factory.example',
  title: 'Style 001 production pack', description: 'Approved production specification',
  constructionNotes: 'Use locked construction sequence and approved seam allowances.',
  qualityNotes: 'Inspect all critical measurements and workmanship checkpoints.',
  packingNotes: 'Pack individually with size and colour identification.',
});

function draft() { return createTechPack({ id: 'tech-pack-1', catalogSku: sku, input: complete, createdAt: '2026-08-04T16:00:00.000Z' }); }
function issued() { return issueTechPack(draft(), { ...dependencies, actorId: 'owner-1', issuedAt: '2026-08-04T16:10:00.000Z' }); }

test('supplier acknowledgement binds the exact issued version and supplier identity', () => {
  const value = acknowledgeTechPack(issued(), {
    supplierCode: 'FACTORY-01', acknowledgementReference: 'FACTORY-ACK-9081', acknowledgedBy: 'Mei Lin', notes: 'Revision received and accepted for production', acknowledgedAt: '2026-08-04T16:15:00.000Z',
  });
  assert.equal(value.status, 'acknowledged');
  assert.equal(value.version, 3);
  assert.equal(value.acknowledgement.issuedTechPackVersion, 2);
  assert.equal(value.acknowledgement.supplierCode, value.supplierCode);
  assert.equal(value.acknowledgedAt, value.acknowledgement.acknowledgedAt);
  assert.throws(() => acknowledgeTechPack(issued(), { supplierCode: 'FACTORY-02', acknowledgementReference: 'ACK-2', acknowledgedBy: 'Other Factory', notes: null, acknowledgedAt: '2026-08-04T16:15:00.000Z' }), { code: 'TECH_PACK_ACK_SUPPLIER_MISMATCH' });
});

test('acknowledged packs can create a traceable revision and can be superseded or withdrawn', () => {
  const acknowledged = acknowledgeTechPack(issued(), { supplierCode: 'FACTORY-01', acknowledgementReference: 'FACTORY-ACK-9081', acknowledgedBy: 'Mei Lin', notes: null, acknowledgedAt: '2026-08-04T16:15:00.000Z' });
  const revision = createTechPackRevision({ id: 'tech-pack-2', issuedTechPack: acknowledged, catalogSku: sku, createdAt: '2026-08-04T16:20:00.000Z', input: { techPackCode: 'TP-STYLE-001-R02' } });
  assert.equal(revision.revision, 2);
  assert.equal(revision.sourceTechPackCode, acknowledged.techPackCode);
  assert.equal(supersedeTechPack(acknowledged, { supersededAt: '2026-08-04T16:30:00.000Z' }).status, 'superseded');
  assert.equal(withdrawTechPack(acknowledged, { reason: 'Production programme cancelled', withdrawnAt: '2026-08-04T16:30:00.000Z' }).status, 'withdrawn');
});
