import test from 'node:test';
import assert from 'node:assert/strict';
import {
  allocateRfq, awardRfq, createRfq, createSupplier, issueRfq, qualifySupplier,
  suspendSupplier, upsertRfqQuote,
} from '../src/modules/sourcing/public.mjs';

const sku = Object.freeze({ sku: 'SKU-COAT-001', brandId: 'brand-1', status: 'published', version: 7 });
const bom = Object.freeze({ sku: sku.sku, brandId: sku.brandId, status: 'published', version: 4, currency: 'EUR', totalCost: 125.5 });
const supplierInput = (code, legalName = code) => ({
  supplierCode: code, legalName, countryCode: 'IT', email: `${code.toLowerCase()}@factory.example`, currency: 'EUR',
  incoterms: ['FOB', 'EXW'], categories: ['Outerwear'], leadTimeDays: 55, minimumOrderQuantity: 100,
  paymentTermsDays: 30, auditExpiresAt: '2027-01-01T00:00:00.000Z', notes: null,
});
const rfqInput = (codes) => ({
  rfqCode: 'RFQ-COAT-001', sku: sku.sku, targetQuantity: 500,
  responseDueAt: '2026-09-10T00:00:00.000Z', deliveryDueAt: '2026-12-01T00:00:00.000Z',
  incoterm: 'FOB', supplierCodes: codes, notes: 'AW26 competitive sourcing',
});

function qualifiedSupplier(code, legalName) {
  return qualifySupplier(createSupplier({ id: `supplier-${code}`, brandId: sku.brandId, input: supplierInput(code, legalName), createdAt: '2026-08-01T00:00:00.000Z' }), { qualifiedAt: '2026-08-02T00:00:00.000Z' });
}
function domainCode(error) { return error?.code; }

test('supplier to RFQ to quotation to award to production allocation is a closed lifecycle', () => {
  const first = qualifiedSupplier('FACTORY-A', 'Factory A S.p.A.');
  const second = qualifiedSupplier('FACTORY-B', 'Factory B S.r.l.');
  let rfq = createRfq({ id: 'rfq-1', catalogSku: sku, bom, suppliers: [first, second], input: rfqInput([first.supplierCode, second.supplierCode]), createdAt: '2026-08-05T00:00:00.000Z' });
  assert.equal(rfq.status, 'draft');
  assert.equal(rfq.bomVersion, 4);
  assert.equal(rfq.bomTotalCost, 125.5);

  rfq = issueRfq(rfq, { catalogSku: sku, bom, suppliers: [first, second], issuedAt: '2026-08-06T00:00:00.000Z' });
  assert.equal(rfq.status, 'issued');

  rfq = upsertRfqQuote(rfq, { supplier: first, receivedAt: '2026-08-08T00:00:00.000Z', input: { supplierCode: first.supplierCode, unitPriceMinor: 14900, fixedCostMinor: 100000, leadTimeDays: 50, minimumOrderQuantity: 100, validUntil: '2026-10-01T00:00:00.000Z', notes: null } });
  rfq = upsertRfqQuote(rfq, { supplier: second, receivedAt: '2026-08-09T00:00:00.000Z', input: { supplierCode: second.supplierCode, unitPriceMinor: 14500, fixedCostMinor: 300000, leadTimeDays: 45, minimumOrderQuantity: 150, validUntil: '2026-10-01T00:00:00.000Z', notes: 'Includes PPS' } });
  assert.equal(rfq.status, 'quoted');
  assert.equal(rfq.quotes.length, 2);
  assert.equal(rfq.quotes.find((quote) => quote.supplierCode === 'FACTORY-A').totalCostMinor, 7_550_000);

  rfq = awardRfq(rfq, { supplier: second, awardedAt: '2026-08-10T00:00:00.000Z' });
  assert.equal(rfq.status, 'awarded');
  assert.equal(rfq.selectedSupplierCode, 'FACTORY-B');
  assert.equal(rfq.award.quoteRevision, 1);

  rfq = allocateRfq(rfq, { supplier: second, allocatedAt: '2026-08-11T00:00:00.000Z', input: { purchaseOrderNumber: 'PO-AW26-0001', quantity: 500, productionStartAt: '2026-08-12T00:00:00.000Z', deliveryDueAt: '2026-11-20T00:00:00.000Z', notes: 'Capacity reserved' } });
  assert.equal(rfq.status, 'allocated');
  assert.deepEqual(rfq.allocation, { purchaseOrderNumber: 'PO-AW26-0001', supplierCode: 'FACTORY-B', quantity: 500, productionStartAt: '2026-08-12T00:00:00.000Z', deliveryDueAt: '2026-11-20T00:00:00.000Z', notes: 'Capacity reserved' });
  assert.equal(Object.isFrozen(rfq), true);
  assert.equal(Object.isFrozen(rfq.quotes), true);
});

test('RFQ issuance blocks stale BOM snapshots and non-qualified suppliers', () => {
  const supplier = qualifiedSupplier('FACTORY-C', 'Factory C');
  const draft = createRfq({ id: 'rfq-2', catalogSku: sku, bom, suppliers: [supplier], input: { ...rfqInput([supplier.supplierCode]), rfqCode: 'RFQ-COAT-002' }, createdAt: '2026-08-05T00:00:00.000Z' });
  assert.throws(() => issueRfq(draft, { catalogSku: sku, bom: { ...bom, version: 5 }, suppliers: [supplier], issuedAt: '2026-08-06T00:00:00.000Z' }), (error) => domainCode(error) === 'RFQ_BOM_SNAPSHOT_STALE');
  const suspended = suspendSupplier(supplier, { reason: 'Compliance evidence expired', suspendedAt: '2026-08-06T00:00:00.000Z' });
  assert.throws(() => issueRfq(draft, { catalogSku: sku, bom, suppliers: [suspended], issuedAt: '2026-08-06T00:00:00.000Z' }), (error) => domainCode(error) === 'RFQ_SUPPLIER_NOT_QUALIFIED');
});

test('quotation and allocation controls reject late responses, MOQ breaches and partial production placement', () => {
  const supplier = qualifiedSupplier('FACTORY-D', 'Factory D');
  let rfq = createRfq({ id: 'rfq-3', catalogSku: sku, bom, suppliers: [supplier], input: { ...rfqInput([supplier.supplierCode]), rfqCode: 'RFQ-COAT-003' }, createdAt: '2026-08-05T00:00:00.000Z' });
  rfq = issueRfq(rfq, { catalogSku: sku, bom, suppliers: [supplier], issuedAt: '2026-08-06T00:00:00.000Z' });
  assert.throws(() => upsertRfqQuote(rfq, { supplier, receivedAt: '2026-09-11T00:00:00.000Z', input: { supplierCode: supplier.supplierCode, unitPriceMinor: 12000, fixedCostMinor: 0, leadTimeDays: 45, minimumOrderQuantity: 100, validUntil: '2026-10-01T00:00:00.000Z', notes: null } }), (error) => domainCode(error) === 'RFQ_RESPONSE_DEADLINE_PASSED');
  assert.throws(() => upsertRfqQuote(rfq, { supplier, receivedAt: '2026-08-08T00:00:00.000Z', input: { supplierCode: supplier.supplierCode, unitPriceMinor: 12000, fixedCostMinor: 0, leadTimeDays: 45, minimumOrderQuantity: 600, validUntil: '2026-10-01T00:00:00.000Z', notes: null } }), (error) => domainCode(error) === 'RFQ_QUOTE_MOQ_NOT_MET');
  rfq = upsertRfqQuote(rfq, { supplier, receivedAt: '2026-08-08T00:00:00.000Z', input: { supplierCode: supplier.supplierCode, unitPriceMinor: 12000, fixedCostMinor: 0, leadTimeDays: 45, minimumOrderQuantity: 100, validUntil: '2026-10-01T00:00:00.000Z', notes: null } });
  rfq = awardRfq(rfq, { supplier, awardedAt: '2026-08-10T00:00:00.000Z' });
  assert.throws(() => allocateRfq(rfq, { supplier, allocatedAt: '2026-08-11T00:00:00.000Z', input: { purchaseOrderNumber: 'PO-AW26-0002', quantity: 400, productionStartAt: '2026-08-12T00:00:00.000Z', deliveryDueAt: '2026-11-20T00:00:00.000Z', notes: null } }), (error) => domainCode(error) === 'RFQ_ALLOCATION_INCOMPLETE');
});
