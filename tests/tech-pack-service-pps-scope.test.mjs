import test from 'node:test';
import assert from 'node:assert/strict';
import { createTechPackService } from '../src/application/tech-pack-service.mjs';
import { createTechPack } from '../src/modules/tech-packs/public.mjs';

const at = '2026-08-05T12:00:00.000Z';
const sku = Object.freeze({ sku: 'STYLE-001', brandId: 'brand-1', status: 'published', version: 3 });
const bom = Object.freeze({ id: 'bom-1', sku: sku.sku, brandId: sku.brandId, status: 'published', version: 4 });
const measurementChart = Object.freeze({ id: 'measurement-1', sku: sku.sku, brandId: sku.brandId, status: 'published', version: 5 });
const matchingPps = Object.freeze({ sampleCode: 'SMP-STYLE-001-PPS-A', sku: sku.sku, brandId: sku.brandId, status: 'approved', sampleType: 'pre-production', supplierCode: 'FACTORY-01', version: 7 });

function draft() {
  return createTechPack({
    id: 'tech-pack-1',
    catalogSku: sku,
    createdAt: at,
    input: {
      techPackCode: 'TP-STYLE-001-R01',
      sku: sku.sku,
      supplierCode: 'FACTORY-01',
      supplierName: 'Factory One',
      supplierEmail: 'production@factory.example',
      title: 'Style 001 production pack',
      description: 'Approved production specification',
      constructionNotes: 'Use the approved construction sequence and seam allowances.',
      qualityNotes: 'Inspect critical measurements and workmanship checkpoints.',
      packingNotes: 'Pack by size and colour with barcode identification.',
    },
  });
}

function harness({ approvedSample = matchingPps } = {}) {
  const current = draft();
  const calls = [];
  let saved = null;
  let outboxCount = 0;
  const tx = {
    getCommand: async () => null,
    getTechPackByCode: async () => current,
    getMembership: async () => Object.freeze({ organisationId: sku.brandId, userId: 'owner-1', role: 'owner', status: 'active' }),
    getSku: async () => sku,
    getBomBySku: async () => bom,
    getMeasurementBySku: async () => measurementChart,
    getApprovedPpsBySkuAndSupplier: async (...args) => { calls.push(args); return approvedSample; },
    getActiveTechPackBySku: async () => null,
    saveTechPack: async (value) => { saved = value; },
    appendOutbox: async () => { outboxCount += 1; },
    insertCommand: async () => {},
  };
  const service = createTechPackService({
    techPackStore: { transaction: (work) => work(tx) },
    clock: () => at,
    nextId: (prefix) => `${prefix}-1`,
  });
  return { service, current, calls, saved: () => saved, outboxCount: () => outboxCount };
}

test('выпуск техпака запрашивает одобренный PPS именно выбранной фабрики', async () => {
  const fixture = harness();
  const issued = await fixture.service.issueTechPack('issue-1', 'owner-1', fixture.current.techPackCode, { expectedVersion: fixture.current.version });

  assert.deepEqual(fixture.calls, [[sku.sku, 'FACTORY-01']]);
  assert.equal(issued.status, 'issued');
  assert.equal(issued.dependencySnapshot.sampleCode, matchingPps.sampleCode);
  assert.equal(fixture.saved().dependencySnapshot.sampleCode, matchingPps.sampleCode);
  assert.equal(fixture.outboxCount(), 1);
});

test('выпуск останавливается до записи, когда у выбранной фабрики нет одобренного PPS', async () => {
  const fixture = harness({ approvedSample: null });

  await assert.rejects(
    () => fixture.service.issueTechPack('issue-2', 'owner-1', fixture.current.techPackCode, { expectedVersion: fixture.current.version }),
    { code: 'TECH_PACK_APPROVED_PPS_NOT_FOUND' },
  );
  assert.deepEqual(fixture.calls, [[sku.sku, 'FACTORY-01']]);
  assert.equal(fixture.saved(), null);
  assert.equal(fixture.outboxCount(), 0);
});
