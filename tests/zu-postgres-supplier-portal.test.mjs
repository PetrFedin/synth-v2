import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migratePostgres } from '../src/infrastructure/postgres-migrator.mjs';
import { createPostgresWholesaleRuntime } from '../src/runtime/postgres-runtime.mjs';

const databaseUrl = process.env.POSTGRES_TEST_URL;
const now = '2026-09-19T10:00:00.000Z';

test('PostgreSQL shows a supplier its own requests, hides its competitors, and stops the moment access is revoked', { skip: !databaseUrl }, async () => {
  const { default: pg } = await import('pg');
  const Pool = pg.Pool;
  const pool = new Pool({ connectionString: databaseUrl, max: 4 });
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  try {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await migratePostgres({ pool, migrationsDir: path.join(root, 'db', 'migrations'), clock: () => now });
    await seed(pool);
    let sequence = 0;
    const runtime = createPostgresWholesaleRuntime({ pool, clock: () => now, nextId: (prefix) => `${prefix}-portal-pg-${++sequence}` });

    // Before a grant exists, the portal is empty rather than forbidden: an account with no standing
    // cannot tell whether the request exists at all.
    assert.deepEqual((await runtime.supplierPortal.rfqsForActor('user-rep', {})).items, []);

    const granted = await runtime.sourcing.grantPortalAccess('cmd-grant', 'brand-owner', 'SUP-ONE', { email: 'rep@one.example', contactName: 'Mei Lin' });
    assert.equal(granted.userId, 'user-rep');
    assert.equal(granted.invitedEmail, 'rep@one.example');

    const visible = await runtime.supplierPortal.rfqsForActor('user-rep', {});
    assert.equal(visible.items.length, 1, 'the issued request addressed to this supplier');
    const [request] = visible.items;
    assert.equal(request.rfqCode, 'RFQ-ISSUED');
    assert.equal(request.supplierStatus, 'quote_submitted');
    assert.equal(request.ownQuote.unitPriceMinor, 5200);
    for (const leak of ['supplierCodes', 'quotes', 'award', 'allocation', 'selectedSupplierCode']) {
      assert.equal(Object.hasOwn(request, leak), false, `the portal projected ${leak}`);
    }
    // The competitor's price is nowhere in what the supplier is handed.
    assert.equal(JSON.stringify(request).includes('SUP-TWO'), false);
    assert.equal(JSON.stringify(request).includes('4100'), false);

    // A brand's own staff hold no grant, so the portal is empty for them too.
    assert.deepEqual((await runtime.supplierPortal.rfqsForActor('brand-owner', {})).items, []);

    const listed = await runtime.sourcing.portalAccessForActor('brand-owner', 'SUP-ONE');
    assert.equal(listed.items.length, 1);

    const revoked = await runtime.sourcing.revokePortalAccess('cmd-revoke', 'brand-owner', 'SUP-ONE', { expectedVersion: granted.version, userId: granted.userId });
    assert.equal(revoked.status, 'revoked');
    assert.equal(revoked.revokedBy, 'brand-owner');
    assert.deepEqual((await runtime.supplierPortal.rfqsForActor('user-rep', {})).items, []);
    // The revocation stays readable: an access list that forgets is not an access list.
    assert.equal((await runtime.sourcing.portalAccessForActor('brand-owner', 'SUP-ONE')).items.length, 1);

    // Re-opening access is a new grant on the same record, and it works.
    const again = await runtime.sourcing.grantPortalAccess('cmd-regrant', 'brand-owner', 'SUP-ONE', { email: 'rep@one.example', contactName: 'Mei Lin' });
    assert.equal(again.status, 'active');
    assert.equal((await runtime.supplierPortal.rfqsForActor('user-rep', {})).items.length, 1);

    await assert.rejects(
      () => runtime.sourcing.grantPortalAccess('cmd-nobody', 'brand-owner', 'SUP-ONE', { email: 'nobody@nowhere.example' }),
      (error) => error.code === 'SUPPLIER_PORTAL_ACCOUNT_NOT_FOUND',
    );
    // The database refuses a grant to someone who works for the brand, whoever asks for it.
    await assert.rejects(
      () => pool.query(
        `INSERT INTO supplier_portal_grants (id,brand_id,supplier_code,user_id,invited_email,status,granted_by,granted_at,version,payload,created_at,updated_at)
         VALUES ('probe','brand-portal-pg','SUP-ONE','brand-owner','owner@brand.example','active','brand-owner',$1,1,'{}'::jsonb,$1,$1)`,
        [now],
      ),
      (error) => /SUPPLIER_PORTAL_HOLDER_IS_BRAND_MEMBER/.test(String(error.message)),
    );
  } finally {
    await pool.end();
  }
});

async function seed(pool) {
  const brand = { id: 'brand-portal-pg', type: 'brand', name: 'Portal Brand' };
  await pool.query('INSERT INTO organisations (id, type, payload) VALUES ($1,$2,$3::jsonb)', [brand.id, 'brand', JSON.stringify(brand)]);
  const owner = { id: 'm-owner-portal', organisationId: brand.id, organisationType: 'brand', userId: 'brand-owner', role: 'owner', status: 'active' };
  // Сначала личности, потом роли — тот же порядок, что и во всех настоящих путях заведения.
  // Обратный порядок база теперь отвергает: занять идентификатор, за которым уже закреплены роли,
  // значило бы получить их вместе с ним.
  await pool.query(
    `INSERT INTO auth_users (id, email, email_normalized, display_name, password_hash, status, created_at, updated_at)
     VALUES ('user-rep','rep@one.example','rep@one.example','Mei Lin','x','active',$1,$1),
            ('brand-owner','owner@brand.example','owner@brand.example','Owner','x','active',$1,$1)`,
    [now],
  );
  await pool.query('INSERT INTO memberships (id,organisation_id,user_id,organisation_type,role,status,payload) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)',
    [owner.id, brand.id, owner.userId, 'brand', 'owner', 'active', JSON.stringify(owner)]);

  for (const [id, code] of [['supplier-one', 'SUP-ONE'], ['supplier-two', 'SUP-TWO']]) {
    const supplier = {
      id, supplierCode: code, brandId: brand.id, status: 'qualified', countryCode: 'TR', currency: 'EUR',
      legalName: `${code} Mills`, leadTimeDays: 30, minimumOrderQuantity: 1, auditExpiresAt: '2027-09-19T10:00:00.000Z',
      version: 1, incoterms: ['FOB'], categories: ['apparel'], createdAt: now, updatedAt: now, qualifiedAt: now,
    };
    await pool.query(
      `INSERT INTO suppliers (id,supplier_code,brand_id,status,country_code,currency,lead_time_days,minimum_order_quantity,audit_expires_at,version,payload,created_at,updated_at,qualified_at)
       VALUES ($1,$2,$3,'qualified','TR','EUR',30,1,$4,1,$5::jsonb,$6,$6,$6)`,
      [id, code, brand.id, supplier.auditExpiresAt, JSON.stringify(supplier), now],
    );
  }

  const campaign = { id: 'campaign-portal-pg', brandId: brand.id, status: 'open', version: 1 };
  const collection = { id: 'collection-portal-pg', campaignId: campaign.id, brandId: brand.id, status: 'published', currency: 'EUR', version: 1 };
  await pool.query('INSERT INTO campaigns (id,brand_id,status,version,payload) VALUES ($1,$2,$3,$4,$5::jsonb)', [campaign.id, brand.id, 'open', 1, JSON.stringify(campaign)]);
  await pool.query('INSERT INTO collections (id,campaign_id,brand_id,status,currency,version,payload) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)', [collection.id, campaign.id, brand.id, 'published', 'EUR', 1, JSON.stringify(collection)]);
  const sku = { id: 'SKU-PORTAL', sku: 'SKU-PORTAL', collectionId: collection.id, brandId: brand.id, name: 'Portal Jacket', wholesalePrice: 120, currency: 'EUR', minimumOrderQuantity: 1, availableQuantity: 100, reservedQuantity: 0, availableToSell: 100, status: 'published', version: 1, createdAt: now, updatedAt: now };
  await pool.query('INSERT INTO catalog_skus (sku,collection_id,brand_id,status,currency,wholesale_price,minimum_order_quantity,available_quantity,reserved_quantity,version,payload) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,$9,$10::jsonb)',
    [sku.sku, collection.id, brand.id, 'published', 'EUR', 120, 1, 100, 1, JSON.stringify(sku)]);

  // One request this supplier was invited to and answered, alongside a competitor's answer; and one
  // the brand has not issued, which nobody outside it may see.
  const quotes = [
    { supplierCode: 'SUP-ONE', supplierName: 'SUP-ONE Mills', unitPriceMinor: 5200, revision: 1, receivedAt: now },
    { supplierCode: 'SUP-TWO', supplierName: 'SUP-TWO Mills', unitPriceMinor: 4100, revision: 1, receivedAt: now },
  ];
  await insertRfq(pool, brand.id, {
    id: 'rfq-issued', rfqCode: 'RFQ-ISSUED', status: 'issued', issuedAt: now,
    supplierCodes: ['SUP-ONE', 'SUP-TWO'], quotes, incoterm: 'FOB', notes: 'SS27 enquiry',
  });
  await insertRfq(pool, brand.id, {
    id: 'rfq-draft', rfqCode: 'RFQ-DRAFT', status: 'draft', issuedAt: null,
    supplierCodes: ['SUP-ONE'], quotes: [], incoterm: 'FOB', notes: null,
  });
}

async function insertRfq(pool, brandId, { id, rfqCode, status, issuedAt, supplierCodes, quotes, incoterm, notes }) {
  const payload = {
    id, rfqCode, brandId, sku: 'SKU-PORTAL', skuVersion: 1, bomVersion: 1, status, targetQuantity: 400,
    responseDueAt: '2026-11-20T00:00:00.000Z', deliveryDueAt: '2027-02-15T00:00:00.000Z',
    selectedSupplierCode: null, version: 1, supplierCodes, quotes, incoterm, notes,
  };
  await pool.query(
    `INSERT INTO sourcing_rfqs (id,rfq_code,brand_id,sku,sku_version,bom_version,status,target_quantity,response_due_at,delivery_due_at,selected_supplier_code,version,payload,created_at,updated_at,issued_at)
     VALUES ($1,$2,$3,'SKU-PORTAL',1,1,$4,400,$5,$6,NULL,1,$7::jsonb,$8,$8,$9)`,
    [id, rfqCode, brandId, status, payload.responseDueAt, payload.deliveryDueAt, JSON.stringify(payload), now, issuedAt],
  );
}
