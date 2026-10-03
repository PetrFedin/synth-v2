import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migratePostgres } from '../src/infrastructure/postgres-migrator.mjs';
import { createPostgresWholesaleRuntime } from '../src/runtime/postgres-runtime.mjs';

const databaseUrl = process.env.POSTGRES_TEST_URL;
const now = '2026-10-02T10:00:00.000Z';
const issued = '2026-09-30T10:00:00.000Z';
const dueOn = '2026-11-20T00:00:00.000Z';
const validUntil = '2027-01-31T00:00:00.000Z';

// S-01 against a real database: the supplier answers for itself, and the rows show it — its own quotation
// beside the competitor's untouched, an order confirmed under the supplier's name, the audit event in the
// outbox, and nothing at all once the grant is revoked or the supplier is suspended.
test('PostgreSQL lets a supplier answer for itself and nobody else', { skip: !databaseUrl }, async () => {
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 4 });
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  try {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await migratePostgres({ pool, migrationsDir: path.join(root, 'db', 'migrations'), clock: () => now });
    await seed(pool);
    let sequence = 0;
    const runtime = createPostgresWholesaleRuntime({ pool, clock: () => now, nextId: (prefix) => `${prefix}-w-${++sequence}` });
    const portal = runtime.supplierPortal;
    const grantOne = await runtime.sourcing.grantPortalAccess('cmd-grant-1', 'brand-owner', 'SUP-ONE', { email: 'rep@one.example', contactName: 'Mei Lin' });
    await runtime.sourcing.grantPortalAccess('cmd-grant-2', 'brand-owner', 'SUP-TWO', { email: 'rep@two.example', contactName: 'Ali Kaya' });

    // The grant tells the screen what it may offer.
    const listed = await portal.suppliersForActor('user-one');
    assert.deepEqual([...listed.items[0].capabilities].sort(), ['supplier-portal.counter.accept', 'supplier-portal.order.confirm', 'supplier-portal.quote.submit']);

    // (1) A quotation. The competitor already quoted; the supplier's own row appears beside it.
    const before = await portal.rfqsForActor('user-one', {});
    assert.equal(before.items[0].supplierStatus, 'awaiting_quote');
    const receipt = await portal.submitQuote('cmd-quote-1', 'user-one', 'RFQ-W', {
      expectedVersion: before.items[0].version, supplierCode: 'SUP-ONE', unitPriceMinor: 5200, fixedCostMinor: 1000,
      leadTimeDays: 30, minimumOrderQuantity: 100, validUntil, notes: null, tiers: [],
    });
    assert.equal(receipt.supplierStatus, 'quote_submitted');
    assert.equal(JSON.stringify(receipt).includes('SUP-TWO'), false);
    const row = (await pool.query("SELECT status, version, payload FROM sourcing_rfqs WHERE rfq_code = 'RFQ-W'")).rows[0];
    assert.equal(row.status, 'quoted');
    assert.equal(row.version, receipt.version);
    const quotes = row.payload.quotes;
    assert.equal(quotes.length, 2);
    assert.equal(quotes.find((quote) => quote.supplierCode === 'SUP-TWO').unitPriceMinor, 4100, 'the competitor\'s row is untouched');
    assert.equal(quotes.find((quote) => quote.supplierCode === 'SUP-ONE').submittedBy.userId, 'user-one');
    // The brand's own read sees the quotation and who sent it.
    const brandView = await runtime.sourcing.rfqGetForActor('brand-owner', 'RFQ-W');
    assert.equal(brandView.quotes.find((quote) => quote.supplierCode === 'SUP-ONE').submittedBy.via, 'supplier-portal');
    // Replays do nothing.
    const replay = await portal.submitQuote('cmd-quote-1', 'user-one', 'RFQ-W', {
      expectedVersion: before.items[0].version, supplierCode: 'SUP-ONE', unitPriceMinor: 5200, fixedCostMinor: 1000,
      leadTimeDays: 30, minimumOrderQuantity: 100, validUntil, notes: null, tiers: [],
    });
    assert.deepEqual(replay, receipt);
    const events = (await pool.query("SELECT event FROM outbox_events WHERE event_type = 'rfq.quote-received'")).rows.map((item) => item.event);
    assert.equal(events.length, 1);
    assert.equal(events[0].metadata.actorKind, 'supplier');
    assert.equal(events[0].metadata.via, 'supplier-portal');
    assert.equal(events[0].metadata.supplierCode, 'SUP-ONE');
    assert.equal(events[0].metadata.actorId, 'user-one');

    // Isolation between two suppliers of the same brand.
    await assert.rejects(() => portal.submitQuote('cmd-cross-1', 'user-two', 'RFQ-ONLY-ONE', { expectedVersion: 1, supplierCode: 'SUP-TWO', unitPriceMinor: 1, fixedCostMinor: 0, leadTimeDays: 1, minimumOrderQuantity: 1, validUntil, notes: null, tiers: [] }), (error) => error.code === 'RFQ_NOT_FOUND');
    await assert.rejects(() => portal.submitQuote('cmd-cross-2', 'user-two', 'RFQ-W', { expectedVersion: 4, supplierCode: 'SUP-ONE', unitPriceMinor: 1, fixedCostMinor: 0, leadTimeDays: 1, minimumOrderQuantity: 1, validUntil, notes: null, tiers: [] }), (error) => error.code === 'SUPPLIER_PORTAL_ACCESS_REQUIRED');
    await assert.rejects(() => portal.confirmOrder('cmd-cross-3', 'user-two', 'PO-ONE', { expectedVersion: 2, supplierCode: 'SUP-TWO', confirmationReference: 'ACK-X', notes: null }), (error) => error.code === 'PRODUCTION_ORDER_NOT_FOUND');
    // A brand member holds no grant and so no standing here.
    await assert.rejects(() => portal.confirmOrder('cmd-cross-4', 'brand-owner', 'PO-ONE', { expectedVersion: 2, supplierCode: 'SUP-ONE', confirmationReference: 'ACK-X', notes: null }), (error) => error.code === 'SUPPLIER_PORTAL_ACCESS_REQUIRED');

    // (2) The brand counters; the supplier accepts.
    const quoted = await runtime.sourcing.rfqGetForActor('brand-owner', 'RFQ-W');
    const countered = await runtime.sourcing.counterQuote('cmd-counter', 'brand-owner', 'RFQ-W', { expectedVersion: quoted.version, supplierCode: 'SUP-ONE', quantity: 400, unitPriceMinor: 4800, notes: null });
    const accepted = await portal.acceptCounterOffer('cmd-accept', 'user-one', 'RFQ-W', { expectedVersion: countered.version, supplierCode: 'SUP-ONE' });
    assert.equal(accepted.ownQuote.unitPriceMinor, 4800);
    assert.equal(accepted.ownQuote.counterOffer.acceptedBy, 'user-one');
    assert.equal(accepted.ownQuote.counterOffer.acceptedVia, 'supplier-portal');
    const stored = (await pool.query("SELECT payload FROM sourcing_rfqs WHERE rfq_code = 'RFQ-W'")).rows[0].payload;
    assert.equal(stored.quotes.find((quote) => quote.supplierCode === 'SUP-TWO').unitPriceMinor, 4100);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM outbox_events WHERE event_type = 'rfq.counter-accepted'")).rows[0].n, 1);

    // (3) Confirm an issued order.
    const orders = await portal.ordersForActor('user-one', {});
    assert.equal(orders.items.length, 1, 'only this supplier\'s order');
    const confirmed = await portal.confirmOrder('cmd-confirm', 'user-one', 'PO-ONE', { expectedVersion: orders.items[0].version, supplierCode: 'SUP-ONE', confirmationReference: 'ACK-1', notes: 'ready to cut' });
    assert.equal(confirmed.status, 'confirmed');
    assert.equal(confirmed.confirmation.confirmedBy, 'Mei Lin');
    const order = (await pool.query("SELECT status, confirmed_at, payload FROM production_orders WHERE production_order_number = 'PO-ONE'")).rows[0];
    assert.equal(order.status, 'confirmed');
    assert.equal(order.payload.confirmation.confirmedByUserId, 'user-one');
    assert.equal((await pool.query("SELECT status FROM production_orders WHERE production_order_number = 'PO-TWO'")).rows[0].status, 'issued', 'the other supplier\'s order is untouched');
    const confirmEvent = (await pool.query("SELECT event FROM outbox_events WHERE event_type = 'production-order.confirmed'")).rows[0].event;
    assert.equal(confirmEvent.metadata.actorKind, 'supplier');
    assert.equal(confirmEvent.payload.productionOrderNumber, 'PO-ONE');
    // The brand reads the confirmation as a fact of the order.
    assert.equal((await runtime.productionOrders.getForActor('brand-owner', 'PO-ONE')).confirmation.confirmationReference, 'ACK-1');

    // Q-03. Suspended: the answer is refused (and so is the replay of a command already taken once).
    const supplierRow = (await pool.query("SELECT version FROM suppliers WHERE supplier_code = 'SUP-TWO'")).rows[0];
    await runtime.sourcing.suspendSupplier('cmd-suspend', 'brand-owner', 'SUP-TWO', { expectedVersion: supplierRow.version, reason: 'Audit lapsed' });
    await assert.rejects(() => portal.confirmOrder('cmd-suspended', 'user-two', 'PO-TWO', { expectedVersion: 2, supplierCode: 'SUP-TWO', confirmationReference: 'ACK-9', notes: null }), (error) => error.code === 'SUPPLIER_PORTAL_SUPPLIER_NOT_QUALIFIED');
    assert.equal((await pool.query("SELECT status FROM production_orders WHERE production_order_number = 'PO-TWO'")).rows[0].status, 'issued');

    // Revoked grant: nothing, not even a replay of the first quotation.
    await runtime.sourcing.revokePortalAccess('cmd-revoke', 'brand-owner', 'SUP-ONE', { expectedVersion: grantOne.version, userId: 'user-one' });
    await assert.rejects(() => portal.submitQuote('cmd-quote-1', 'user-one', 'RFQ-W', { expectedVersion: before.items[0].version, supplierCode: 'SUP-ONE', unitPriceMinor: 5200, fixedCostMinor: 1000, leadTimeDays: 30, minimumOrderQuantity: 100, validUntil, notes: null, tiers: [] }), (error) => error.code === 'SUPPLIER_PORTAL_ACCESS_REQUIRED');
  } finally {
    await pool.end();
  }
});

async function seed(pool) {
  const brand = { id: 'brand-w', type: 'brand', name: 'Writes Brand' };
  await pool.query('INSERT INTO organisations (id, type, payload) VALUES ($1,$2,$3::jsonb)', [brand.id, 'brand', JSON.stringify(brand)]);
  await pool.query(
    `INSERT INTO auth_users (id, email, email_normalized, display_name, password_hash, status, created_at, updated_at)
     VALUES ('user-one','rep@one.example','rep@one.example','Mei Lin','x','active',$1,$1),
            ('user-two','rep@two.example','rep@two.example','Ali Kaya','x','active',$1,$1),
            ('brand-owner','owner@brand.example','owner@brand.example','Owner','x','active',$1,$1)`, [now]);
  const owner = { id: 'm-owner-w', organisationId: brand.id, organisationType: 'brand', userId: 'brand-owner', role: 'owner', status: 'active' };
  await pool.query('INSERT INTO memberships (id,organisation_id,user_id,organisation_type,role,status,payload) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)',
    [owner.id, brand.id, owner.userId, 'brand', 'owner', 'active', JSON.stringify(owner)]);
  for (const [id, code] of [['supplier-one', 'SUP-ONE'], ['supplier-two', 'SUP-TWO']]) {
    const supplier = { id, supplierCode: code, brandId: brand.id, status: 'qualified', countryCode: 'TR', currency: 'EUR', legalName: `${code} Mills`, leadTimeDays: 30, minimumOrderQuantity: 1, auditExpiresAt: '2027-09-19T10:00:00.000Z', version: 1, incoterms: ['FOB'], categories: ['apparel'], createdAt: now, updatedAt: now, qualifiedAt: now };
    await pool.query(
      `INSERT INTO suppliers (id,supplier_code,brand_id,status,country_code,currency,lead_time_days,minimum_order_quantity,audit_expires_at,version,payload,created_at,updated_at,qualified_at)
       VALUES ($1,$2,$3,'qualified','TR','EUR',30,1,$4,1,$5::jsonb,$6,$6,$6)`, [id, code, brand.id, supplier.auditExpiresAt, JSON.stringify(supplier), now]);
  }
  const campaign = { id: 'campaign-w', brandId: brand.id, status: 'open', version: 1 };
  const collection = { id: 'collection-w', campaignId: campaign.id, brandId: brand.id, status: 'published', currency: 'EUR', version: 1 };
  await pool.query('INSERT INTO campaigns (id,brand_id,status,version,payload) VALUES ($1,$2,$3,$4,$5::jsonb)', [campaign.id, brand.id, 'open', 1, JSON.stringify(campaign)]);
  await pool.query('INSERT INTO collections (id,campaign_id,brand_id,status,currency,version,payload) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)', [collection.id, campaign.id, brand.id, 'published', 'EUR', 1, JSON.stringify(collection)]);
  const sku = { id: 'SKU-W', sku: 'SKU-W', collectionId: collection.id, brandId: brand.id, name: 'Writes Jacket', wholesalePrice: 120, currency: 'EUR', minimumOrderQuantity: 1, availableQuantity: 100, reservedQuantity: 0, availableToSell: 100, status: 'published', version: 1, createdAt: now, updatedAt: now };
  await pool.query('INSERT INTO catalog_skus (sku,collection_id,brand_id,status,currency,wholesale_price,minimum_order_quantity,available_quantity,reserved_quantity,version,payload) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,$9,$10::jsonb)',
    [sku.sku, collection.id, brand.id, 'published', 'EUR', 120, 1, 100, 1, JSON.stringify(sku)]);

  await insertRfq(pool, brand.id, { id: 'rfq-w', rfqCode: 'RFQ-W', supplierCodes: ['SUP-ONE', 'SUP-TWO'], quotes: [{ supplierCode: 'SUP-TWO', supplierName: 'SUP-TWO Mills', supplierVersion: 1, unitPriceMinor: 4100, fixedCostMinor: 0, totalCostMinor: 4100 * 400, leadTimeDays: 20, minimumOrderQuantity: 1, validUntil, tiers: [], receivedAt: now, revision: 1 }] });
  await insertRfq(pool, brand.id, { id: 'rfq-only-one', rfqCode: 'RFQ-ONLY-ONE', supplierCodes: ['SUP-ONE'], quotes: [] });
  await insertRfq(pool, brand.id, { id: 'rfq-po-one', rfqCode: 'RFQ-PO-ONE', supplierCodes: ['SUP-ONE'], quotes: [] });
  await insertRfq(pool, brand.id, { id: 'rfq-po-two', rfqCode: 'RFQ-PO-TWO', supplierCodes: ['SUP-TWO'], quotes: [] });
  // The orders are fixtures: the insert trigger demands an allocated source RFQ, which is the brand's
  // side of the story and not what is under test here, so it is stepped around for the two inserts only.
  await pool.query('ALTER TABLE production_orders DISABLE TRIGGER USER');
  await insertOrder(pool, brand.id, { id: 'po-one', number: 'PO-ONE', rfqId: 'rfq-po-one', rfqCode: 'RFQ-PO-ONE', supplierCode: 'SUP-ONE' });
  await insertOrder(pool, brand.id, { id: 'po-two', number: 'PO-TWO', rfqId: 'rfq-po-two', rfqCode: 'RFQ-PO-TWO', supplierCode: 'SUP-TWO' });
  await pool.query('ALTER TABLE production_orders ENABLE TRIGGER USER');
}

async function insertRfq(pool, brandId, { id, rfqCode, supplierCodes, quotes, status = 'issued' }) {
  const payload = {
    id, rfqCode, brandId, sku: 'SKU-W', skuVersion: 1, bomVersion: 1, status, targetQuantity: 400, responseDueAt: dueOn,
    deliveryDueAt: '2027-02-15T00:00:00.000Z', bomCurrency: 'EUR', selectedSupplierCode: null, version: 1, supplierCodes, quotes, incoterm: 'FOB', notes: null,
    createdAt: issued, updatedAt: issued, issuedAt: issued,
  };
  await pool.query(
    `INSERT INTO sourcing_rfqs (id,rfq_code,brand_id,sku,sku_version,bom_version,status,target_quantity,response_due_at,delivery_due_at,selected_supplier_code,version,payload,created_at,updated_at,issued_at)
     VALUES ($1,$2,$3,'SKU-W',1,1,$4,400,$5,$6,NULL,1,$7::jsonb,$8,$8,$8)`,
    [id, rfqCode, brandId, status, payload.responseDueAt, payload.deliveryDueAt, JSON.stringify(payload), issued]);
}

async function insertOrder(pool, brandId, { id, number, rfqId, rfqCode, supplierCode }) {
  const payload = {
    id, productionOrderNumber: number, rfqId, rfqCode, rfqVersion: 1, brandId, supplierCode, sku: 'SKU-W', skuVersion: 1, bomVersion: 1, quantity: 400,
    status: 'issued', version: 2, productionStartAt: '2026-11-01T00:00:00.000Z', deliveryDueAt: '2027-02-15T00:00:00.000Z',
    supplierSnapshot: { supplierCode, legalName: `${supplierCode} Mills` },
    commercialSnapshot: { currency: 'EUR', incoterm: 'FOB', unitPriceMinor: 4800 },
    techPackSnapshot: { techPackCode: 'TP-W', acknowledgementReference: 'ACK-TP' },
    issuedAt: issued, issuedBy: 'brand-owner', confirmedAt: null, confirmation: null, cancelledAt: null, cancellationReason: null, createdAt: issued, updatedAt: issued,
  };
  await pool.query(
    `INSERT INTO production_orders (id,production_order_number,rfq_id,rfq_code,rfq_version,brand_id,supplier_code,sku,sku_version,bom_version,quantity,status,version,production_start_at,delivery_due_at,payload,issued_at,created_at,updated_at)
     VALUES ($1,$2,$3,$4,1,$5,$6,'SKU-W',1,1,400,'issued',2,$7,$8,$9::jsonb,$10,$10,$10)`,
    [id, number, rfqId, rfqCode, brandId, supplierCode, payload.productionStartAt, payload.deliveryDueAt, JSON.stringify(payload), issued]);
}
