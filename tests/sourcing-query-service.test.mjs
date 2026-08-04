import assert from 'node:assert/strict';
import test from 'node:test';
import { createSourcingQueryService } from '../src/application/sourcing-query-service.mjs';

function fixture({ supplierPages = [], rfqPages = [] } = {}) {
  const calls = [];
  return {
    calls,
    reader: {
      supplierPageForActor: async (actorId, options) => {
        calls.push(['supplier-page', actorId, options]);
        return supplierPages.shift() ?? { items: [], hasMore: false };
      },
      supplierGetForActor: async (actorId, supplierCode) => {
        calls.push(['supplier-get', actorId, supplierCode]);
        return actorId === 'allowed' ? { supplierCode, categories: ['Outerwear'], status: 'qualified' } : undefined;
      },
      rfqPageForActor: async (actorId, options) => {
        calls.push(['rfq-page', actorId, options]);
        return rfqPages.shift() ?? { items: [], hasMore: false };
      },
      rfqGetForActor: async (actorId, rfqCode) => {
        calls.push(['rfq-get', actorId, rfqCode]);
        return actorId === 'allowed' ? { rfqCode, supplierCodes: ['FACTORY-A'], quotes: [{ supplierCode: 'FACTORY-A' }] } : undefined;
      },
    },
  };
}

test('supplier pages use immutable filter-bound keyset cursors', async () => {
  const source = fixture({ supplierPages: [{ items: [{ supplierCode: 'FACTORY-A', categories: ['Outerwear'] }], hasMore: true, nextCode: 'FACTORY-A' }] });
  const service = createSourcingQueryService({ reader: source.reader, clock: () => '2026-08-05T00:00:00.000Z' });
  const page = await service.supplierPageForActor('allowed', { limit: '1', q: 'FACTORY', status: 'qualified', brandId: 'brand-1', countryCode: 'IT', category: 'Outerwear' });
  assert.equal(page.referenceTime, '2026-08-05T00:00:00.000Z');
  assert.equal(typeof page.nextCursor, 'string');
  assert.equal(Object.isFrozen(page.items[0].categories), true);

  await service.supplierPageForActor('allowed', { limit: 1, q: 'FACTORY', status: 'qualified', brandId: 'brand-1', countryCode: 'IT', category: 'Outerwear', cursor: page.nextCursor });
  assert.equal(source.calls.at(-1)[2].afterCode, 'FACTORY-A');
  assert.equal(source.calls.at(-1)[2].referenceTime, '2026-08-05T00:00:00.000Z');
  await assert.rejects(() => service.supplierPageForActor('allowed', { limit: 1, q: 'OTHER', status: 'qualified', brandId: 'brand-1', countryCode: 'IT', category: 'Outerwear', cursor: page.nextCursor }), { code: 'SOURCING_CURSOR_INVALID' });
});

test('RFQ pages bind cursor scope to operational filters and preserve the snapshot time', async () => {
  const source = fixture({ rfqPages: [{ items: [{ rfqCode: 'RFQ-001', supplierCodes: ['FACTORY-A'], quotes: [] }], hasMore: true, nextCode: 'RFQ-001' }] });
  const service = createSourcingQueryService({ reader: source.reader, clock: () => '2026-08-05T00:00:00.000Z' });
  const page = await service.rfqPageForActor('allowed', { limit: 1, status: 'issued', sku: 'SKU-001', supplierCode: 'FACTORY-A', overdue: 'true' });
  await service.rfqPageForActor('allowed', { limit: 1, status: 'issued', sku: 'SKU-001', supplierCode: 'FACTORY-A', overdue: true, cursor: page.nextCursor });
  const options = source.calls.at(-1)[2];
  assert.equal(options.afterCode, 'RFQ-001');
  assert.equal(options.referenceTime, '2026-08-05T00:00:00.000Z');
  assert.equal(options.filters.overdue, true);
  await assert.rejects(() => service.rfqPageForActor('allowed', { limit: 1, status: 'quoted', sku: 'SKU-001', supplierCode: 'FACTORY-A', overdue: true, cursor: page.nextCursor }), { code: 'SOURCING_CURSOR_INVALID' });
});

test('query validation rejects malformed filters and masks inaccessible details as not found', async () => {
  const source = fixture({ supplierPages: [{ items: [], hasMore: true }], rfqPages: [{ items: [], hasMore: true }] });
  const service = createSourcingQueryService({ reader: source.reader });
  await assert.rejects(() => service.supplierPageForActor('allowed', { limit: 0 }), { code: 'SOURCING_PAGE_LIMIT_INVALID' });
  await assert.rejects(() => service.supplierPageForActor('allowed', { countryCode: 'ITA' }), { code: 'SUPPLIER_COUNTRY_FILTER_INVALID' });
  await assert.rejects(() => service.rfqPageForActor('allowed', { overdue: 'yes' }), { code: 'SOURCING_OVERDUE_FILTER_INVALID' });
  await assert.rejects(() => service.supplierPageForActor('allowed', {}), { code: 'SOURCING_PAGE_RESULT_INVALID' });
  await assert.rejects(() => service.rfqPageForActor('allowed', {}), { code: 'SOURCING_PAGE_RESULT_INVALID' });

  const supplier = await service.supplierGetForActor('allowed', 'FACTORY-A');
  const rfq = await service.rfqGetForActor('allowed', 'RFQ-001');
  assert.equal(Object.isFrozen(supplier.categories), true);
  assert.equal(Object.isFrozen(rfq.quotes[0]), true);
  await assert.rejects(() => service.supplierGetForActor('outsider', 'FACTORY-A'), { code: 'SUPPLIER_NOT_FOUND' });
  await assert.rejects(() => service.rfqGetForActor('outsider', 'RFQ-001'), { code: 'RFQ_NOT_FOUND' });
});
