import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migratePostgres } from '../src/infrastructure/postgres-migrator.mjs';
import { createPostgresAwaitingActionReader } from '../src/infrastructure/postgres-awaiting-action-reader.mjs';
import { createAwaitingActionQueryService } from '../src/application/awaiting-action-query-service.mjs';
import { AWAITING_ACTION_TYPE_CODES } from '../src/modules/awaiting-action/public.mjs';

const databaseUrl = process.env.POSTGRES_TEST_URL;
const now = '2026-10-02T12:00:00.000Z';
const day = 86_400_000;
const ago = (days) => new Date(Date.parse(now) - days * day).toISOString();

const BRAND = 'brand-aw';
const SHOP = 'shop-aw';
const OTHER = 'brand-other';

test('PostgreSQL lists, in one statement, only the moves that are the reader\'s own and that their role may make', { skip: !databaseUrl }, async () => {
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 4 });
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  try {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await migratePostgres({ pool, migrationsDir: path.join(root, 'db', 'migrations'), clock: () => now });
    await seed(pool);

    let statements = [];
    const spy = {
      async connect() {
        const client = await pool.connect();
        return {
          query(text, values) { statements.push(String(text)); return client.query(text, values); },
          release: (...args) => client.release(...args),
        };
      },
    };
    const service = createAwaitingActionQueryService({ clock: () => now, reader: createPostgresAwaitingActionReader({ pool: spy }) });
    const types = async (actor, query = {}) => (await service.forActor(actor, { limit: '200', ...query })).items.map((item) => item.type).sort();

    // The whole question — every kind of work and the counters — is one statement in one snapshot.
    statements = [];
    const owner = await service.forActor('u-owner', { limit: '200' });
    const selects = statements.filter((text) => /\bWITH me AS\b/.test(text));
    assert.equal(selects.length, 1, 'one query for all kinds of work');
    assert.equal(statements.filter((text) => !/^(BEGIN|COMMIT)/.test(text) && !/\bWITH me AS\b/.test(text)).length, 0, 'no further queries per item or per kind');

    // The owner holds every capability and belongs to the brand: everything that waits for the brand.
    assert.deepEqual(
      [...new Set(owner.items.map((item) => item.type))].sort(),
      AWAITING_ACTION_TYPE_CODES.filter((type) => !['selection-approval', 'showroom-invitation-response', 'relationship-response', 'receipt-accept'].includes(type)).sort(),
      'every brand-side kind is present, none of the shop-side ones',
    );
    assert.equal(owner.total, owner.items.length);
    assert.equal(owner.counts['order-accept-terms'].count, 2, 'a draft nobody accepted and a draft only the shop accepted; not the ready one');
    assert.equal(owner.counts['order-attach'].count, 1);
    assert.equal(owner.counts['order-amendment-response'].count, 1, 'only the amendment the shop proposed, not the brand\'s own');
    assert.equal(owner.counts['rfq-award'].count, 1);
    assert.equal(owner.counts['inspection-review'].count, 1);
    assert.equal(owner.counts['supplier-payment'].count, 1, 'the paid and the not-yet-triggered milestones are not owed');
    assert.equal(owner.counts['showroom-invitation-response']?.count ?? 0, 0);
    assert.equal(owner.counts['claim-resolve'].count, 1, 'the claim nobody has resolved yet; not the one with a resolution');
    assert.equal(owner.counts['receipt-accept']?.count ?? 0, 0, 'receiving is the shop\'s move, not the brand\'s');

    // Each role sees its own part and nothing more.
    assert.deepEqual(await types('u-quality'), ['inspection-review', 'lab-dip-decision', 'material-lot-release']);
    assert.deepEqual(await types('u-finance'), ['compliance-document-issue', 'order-accept-terms', 'order-accept-terms', 'supplier-payment']);
    assert.deepEqual(await types('u-sales'), ['claim-resolve', 'order-accept-terms', 'order-accept-terms', 'order-amendment-response', 'order-attach', 'technical-review']);
    assert.deepEqual(await types('u-viewer'), [], 'a viewer can read everything and do nothing');
    // A shipment waits for the buyer until a FINAL receipt exists: a partial receipt leaves it open, a final one closes it.
    assert.deepEqual(await types('u-buyer'), ['order-accept-terms', 'order-amendment-response', 'order-attach', 'receipt-accept', 'receipt-accept', 'relationship-response', 'showroom-invitation-response']);
    assert.deepEqual(await types('u-shopfin'), ['order-accept-terms', 'selection-approval']);
    // Somebody else's organisation, and somebody with none, are shown nothing of this brand's.
    assert.deepEqual(await types('u-outsider'), []);
    assert.deepEqual(await types('u-nobody'), []);
    assert.equal((await service.forActor('u-nobody', {})).total, 0);

    // The inspector who completed the run cannot sign it off, so it is not offered to them.
    assert.deepEqual(await types('u-inspector'), ['lab-dip-decision', 'material-lot-release']);

    // A suspended membership stops the list at once.
    await pool.query("UPDATE memberships SET status = 'suspended' WHERE user_id = 'u-quality'");
    assert.deepEqual(await types('u-quality'), []);
    await pool.query("UPDATE memberships SET status = 'active' WHERE user_id = 'u-quality'");

    // An expired invitation can no longer be accepted, so it is not waiting.
    const invitations = (await service.forActor('u-buyer', { type: 'showroom-invitation-response' })).items;
    assert.equal(invitations.length, 1);
    assert.equal(invitations[0].entityId, 'inv-open');
    assert.equal(invitations[0].overdue, false);
    assert.equal(invitations[0].dueAt, new Date(Date.parse(now) + 5 * day).toISOString());

    // Order: overdue first, then oldest. The payment fell due 40 days ago and ran out 10 days ago.
    assert.equal(owner.items[0].type, 'supplier-payment');
    assert.equal(owner.items[0].overdue, true);
    assert.equal(owner.items[0].entityId, 'PO-AW-1#1');
    assert.equal(owner.items[0].detail.amountMinor, 30_000);
    assert.equal(owner.items[0].overdueSeconds, 10 * 86_400);
    assert.equal(owner.overdue, 1);
    const rest = owner.items.slice(1).map((item) => Date.parse(item.waitingSince));
    assert.deepEqual(rest, [...rest].sort((a, b) => a - b), 'the rest is oldest first');
    for (const item of owner.items) {
      assert.ok(item.route.view && item.route.entityId, `${item.type} has a route`);
      assert.ok(item.ageSeconds >= 0 && item.waitingSince, `${item.type} has an age`);
    }
    const rfq = owner.items.find((item) => item.type === 'rfq-award');
    assert.equal(rfq.ageSeconds, 3 * 86_400);
    assert.equal(rfq.detail.quoteCount, 2);

    // Counters cover everything that waits, not the page; the filter narrows them to what it names.
    const page = await service.forActor('u-owner', { limit: '2' });
    assert.equal(page.items.length, 2);
    assert.equal(page.total, owner.total);
    assert.equal((await service.forActor('u-owner', { limit: '0' })).items.length, 0);
    const quality = await service.forActor('u-owner', { group: 'quality', limit: '200' });
    assert.deepEqual([...new Set(quality.items.map((item) => item.group))], ['quality']);
    assert.equal(quality.total, quality.items.length);
    assert.deepEqual(Object.keys(quality.counts).sort(), ['inspection-review', 'lab-dip-decision', 'material-lot-release']);

    // The state is the source: once the move is made, the item is gone, with nothing to clean up.
    await pool.query("UPDATE sourcing_rfqs SET status = 'awarded' WHERE rfq_code = 'RFQ-AW-1'");
    assert.equal((await service.forActor('u-owner', { type: 'rfq-award' })).total, 0);
    // A claim leaves the brand's list the moment it has a resolution; a shipment leaves the buyer's once its receipt is final.
    await raw(pool, "INSERT INTO receipt_claim_resolution_snapshots (id, claim_snapshot_id, claim_content_hash, order_id, order_version, order_commit_snapshot_id, supply_commitment_snapshot_id, fulfillment_plan_snapshot_id, shipment_notice_snapshot_id, latest_receipt_snapshot_id, receipt_discrepancy_snapshot_id, brand_id, shop_id, resolution_type, resolution_reason, status, resolved_at, content_hash, payload) VALUES ('res-late', 'clm-open', 'c', 'ord-attached', 2, 'oc', 'sc', 'fp', 'sn-open', 'rc', 'disc', $1, $2, 'rejected', 'no', 'resolved', $3, 'hash-late', '{}')", [BRAND, SHOP, now]);
    assert.equal((await service.forActor('u-sales', { type: 'claim-resolve' })).total, 0);
    await raw(pool, "UPDATE receipt_snapshots SET receipt_complete = true WHERE id = 'rc-partial'");
    assert.deepEqual((await service.forActor('u-buyer', { type: 'receipt-accept' })).items.map((item) => item.entityId), ['sn-open']);
    await pool.query("UPDATE payment_milestones SET paid_at = $1 WHERE id = 'ms-1'", [now]);
    assert.equal((await service.forActor('u-finance', { type: 'supplier-payment' })).total, 0);
  } finally {
    await pool.end();
  }
});

// Snapshot tables are immutable and foreign-keyed on purpose; this test proves the reader's selection, so
// its late edits go through a session that skips those guards, exactly as the seed does.
async function raw(pool, text, params = []) {
  const client = await pool.connect();
  try {
    await client.query("SET session_replication_role = 'replica'");
    await client.query(text, params);
  } finally {
    client.release();
  }
}

async function seed(pool) {
  const client = await pool.connect();
  try {
    // Foreign keys and triggers are skipped on purpose: this proves what the reader selects from
    // the state it finds, and the integrity of the tables it reads is proven by their own suites.
    await client.query("SET session_replication_role = 'replica'");
    // The same goes for CHECK constraints (payload mirrors, status/timestamp pairings, context rules): the reader
    // under test selects from columns, and these rows are written as columns, with the few
    // values that matter set explicitly. The schema is rebuilt
    // from scratch above, so dropping them here touches nothing else.
    await client.query(`DO $$ DECLARE c record; BEGIN
      FOR c IN SELECT conrelid::regclass AS tbl, conname FROM pg_constraint WHERE contype = 'c' AND connamespace = 'public'::regnamespace
      LOOP EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', c.tbl, c.conname); END LOOP; END $$`);
    const insert = async (table, values) => {
      const columns = Object.keys(values);
      await client.query(
        `INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map((_, index) => `$${index + 1}`).join(',')})`,
        columns.map((column) => (column === 'payload' || (values[column] && typeof values[column] === 'object' && !(values[column] instanceof Date) && !Array.isArray(values[column])) ? JSON.stringify(values[column]) : values[column])),
      );
    };
    for (const [id, type] of [[BRAND, 'brand'], [SHOP, 'shop'], [OTHER, 'brand']]) await insert('organisations', { id, type, payload: { id, type, name: `Name ${id}` } });
    const members = [
      ['u-owner', BRAND, 'brand', 'owner'], ['u-quality', BRAND, 'brand', 'quality'], ['u-inspector', BRAND, 'brand', 'quality'],
      ['u-finance', BRAND, 'brand', 'finance'], ['u-sales', BRAND, 'brand', 'sales'], ['u-viewer', BRAND, 'brand', 'viewer'],
      ['u-buyer', SHOP, 'shop', 'buyer'], ['u-shopfin', SHOP, 'shop', 'finance'], ['u-outsider', OTHER, 'brand', 'owner'],
    ];
    for (const [userId, organisationId, organisationType, role] of members) {
      await insert('memberships', { id: `m-${userId}`, organisation_id: organisationId, user_id: userId, organisation_type: organisationType, role, status: 'active', payload: { id: `m-${userId}`, userId, organisationId, role } });
    }

    // Product Engineering contributes a real brand-side Awaiting Action when an accepted source
    // has unresolved technical review work. Seed one pending proposal so the PostgreSQL sweep proves
    // the new kind is selected by the same one-statement authority as every older kind.
    await insert('product_styles', { id: 'style-aw', brand_id: BRAND, style_code: 'STYLE-AW', lifecycle_status: 'draft', version: 1, created_at: ago(6), created_by: 'u-owner', updated_at: ago(2), updated_by: 'u-owner' });
    await insert('product_engineering_analysis_runs', {
      id: 'analysis-aw', brand_id: BRAND, style_id: 'style-aw', purpose: 'garment_interpretation', status: 'completed',
      input_manifest: {}, input_hash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', requested_at: ago(3), requested_by: 'u-owner', version: 1,
    });
    await insert('product_engineering_proposals', {
      id: 'proposal-aw', analysis_run_id: 'analysis-aw', brand_id: BRAND, style_id: 'style-aw', target_authority: 'product_identity',
      target_field: 'product_identity.category', proposed_value: { code: 'outerwear' }, status: 'pending', created_at: ago(2), created_by: 'u-owner', version: 1,
    });

    const order = (id, status, accepted, updatedAt) => insert('orders', {
      id, selection_id: `sel-${id}`, cycle_id: `cycle-${id}`, brand_id: BRAND, shop_id: SHOP, status, currency: 'EUR', total_amount: 1000, version: 2,
      payload: { id, status, acceptedOrganisationIds: accepted, createdAt: updatedAt, updatedAt },
    });
    await order('ord-draft', 'draft', [], ago(6));
    await order('ord-half', 'draft', [SHOP], ago(2));
    await order('ord-ready', 'ready', [BRAND, SHOP], ago(1));
    await order('ord-attached', 'attached', [BRAND, SHOP], ago(20));
    await order('ord-done', 'cancelled', [], ago(30));
    const amendment = (id, proposedBy) => insert('order_amendments', {
      id, order_id: 'ord-attached', line_no: id === 'am-1' ? 1 : 2, current_quantity: 10, proposed_quantity: 12, delta_amount: 100, currency: 'EUR', reason: 'more',
      status: 'proposed', proposed_organisation_id: proposedBy, proposed_by: 'x', proposed_at: ago(4), payload: {},
    });
    await amendment('am-1', SHOP);
    await amendment('am-2', BRAND);
    await insert('selections', { id: 'sel-pending', cycle_id: 'cycle-p', showroom_id: 'sr', collection_id: 'col', brand_id: BRAND, shop_id: SHOP, status: 'pending_approval', version: 1, payload: { approvalRequestedAt: ago(1), updatedAt: ago(1) } });
    await insert('selections', { id: 'sel-draft', cycle_id: 'cycle-d', showroom_id: 'sr', collection_id: 'col', brand_id: BRAND, shop_id: SHOP, status: 'draft', version: 1, payload: {} });
    await insert('counterparty_relationships', { id: 'rel-1', brand_id: BRAND, shop_id: SHOP, status: 'pending', version: 1, payload: { requestedByOrganisationId: BRAND, createdAt: ago(3), updatedAt: ago(3) } });
    for (const [id, expiresIn] of [['inv-open', 5], ['inv-expired', -2]]) {
      await insert('showroom_invitations', { id, showroom_id: `sr-${id}`, relationship_id: 'rel-1', brand_id: BRAND, shop_id: SHOP, status: 'pending', expires_at: new Date(Date.parse(now) + expiresIn * day).toISOString(), version: 1, payload: { createdAt: ago(7), updatedAt: ago(7) } });
    }

    const quoted = { quotes: [{ supplierCode: 'S1' }, { supplierCode: 'S2' }] };
    await insert('sourcing_rfqs', { id: 'rfq-1', rfq_code: 'RFQ-AW-1', brand_id: BRAND, sku: 'SKU-AW', sku_version: 1, bom_version: 1, status: 'quoted', target_quantity: 100, response_due_at: ago(-5), delivery_due_at: ago(-60), version: 3, payload: quoted, created_at: ago(9), updated_at: ago(3) });
    await insert('sourcing_rfqs', { id: 'rfq-2', rfq_code: 'RFQ-AW-2', brand_id: BRAND, sku: 'SKU-AW', sku_version: 1, bom_version: 1, status: 'issued', target_quantity: 100, response_due_at: ago(-5), delivery_due_at: ago(-60), version: 2, payload: {}, created_at: ago(9), updated_at: ago(3) });
    await insert('material_rfqs', { id: 'mrfq-1', rfq_code: 'MRFQ-AW-1', brand_id: BRAND, material_code: 'MAT-AW', material_version: 1, status: 'quoted', target_quantity: 50, unit: 'm', response_due_at: ago(-5), delivery_due_at: ago(-60), version: 3, payload: quoted, created_at: ago(8), updated_at: ago(2) });
    await insert('production_orders', { id: 'po-1', production_order_number: 'PO-AW-1', rfq_id: 'rfq-1', rfq_code: 'RFQ-AW-1', rfq_version: 3, brand_id: BRAND, supplier_code: 'S1', sku: 'SKU-AW', sku_version: 1, bom_version: 1, quantity: 100, status: 'confirmed', version: 3, production_start_at: ago(-5), delivery_due_at: ago(-60), payload: {}, issued_at: ago(50), confirmed_at: ago(40), created_at: ago(50), updated_at: ago(40) });
    await insert('production_orders', { id: 'po-2', production_order_number: 'PO-AW-2', rfq_id: 'rfq-2', rfq_code: 'RFQ-AW-2', rfq_version: 3, brand_id: BRAND, supplier_code: 'S1', sku: 'SKU-AW', sku_version: 1, bom_version: 1, quantity: 100, status: 'issued', version: 2, production_start_at: ago(-5), delivery_due_at: ago(-60), payload: {}, issued_at: ago(5), created_at: ago(5), updated_at: ago(5) });
    await insert('material_purchase_orders', { id: 'mpo-1', purchase_order_number: 'MPO-AW-1', rfq_id: 'mrfq-1', rfq_code: 'MRFQ-AW-1', rfq_version: 3, brand_id: BRAND, supplier_code: 'S1', material_code: 'MAT-AW', material_version: 1, quantity: 50, unit: 'm', status: 'issued', version: 2, order_placed_at: ago(2), delivery_due_at: ago(-20), payload: {}, issued_at: ago(2), created_at: ago(2), updated_at: ago(2) });
    await insert('tech_packs', { id: 'tp-1', tech_pack_code: 'TP-AW-1', sku: 'SKU-AW', brand_id: BRAND, sku_version: 1, revision: 2, status: 'issued', supplier_code: 'S1', version: 2, payload: {}, issued_at: ago(7), created_at: ago(8), updated_at: ago(7) });
    await insert('samples', { id: 'smp-1', sample_code: 'SMP-AW-1', sku: 'SKU-AW', brand_id: BRAND, sku_version: 1, sample_type: 'proto', round: 1, status: 'received', version: 4, payload: {}, received_at: ago(3), created_at: ago(20), updated_at: ago(3) });
    await insert('production_executions', { id: 'pe-1', execution_code: 'PE-AW-1', production_order_id: 'po-1', production_order_number: 'PO-AW-1', production_order_version: 3, brand_id: BRAND, supplier_code: 'S1', sku: 'SKU-AW', quantity: 100, status: 'active', version: 2, production_start_at: ago(-5), delivery_due_at: ago(-60), payload: {}, started_at: null, created_at: ago(30), updated_at: ago(30) });
    await insert('quality_inspections', { id: 'qi-1', inspection_code: 'QI-AW-1', execution_id: 'pe-1', execution_code: 'PE-AW-1', execution_version: 2, production_order_number: 'PO-AW-1', production_order_version: 3, brand_id: BRAND, supplier_code: 'S1', sku: 'SKU-AW', quantity: 100, status: 'review-pending', version: 3, current_run: 1, payload: { runs: [{ runNumber: 1, status: 'completed', inspectorId: 'u-inspector', completedBy: 'u-inspector', recommendation: 'pass' }] }, created_at: ago(5), updated_at: ago(1) });
    await insert('quality_inspections', { id: 'qi-2', inspection_code: 'QI-AW-2', execution_id: 'pe-x', execution_code: 'PE-AW-X', execution_version: 2, production_order_number: 'PO-AW-2', production_order_version: 3, brand_id: BRAND, supplier_code: 'S1', sku: 'SKU-AW', quantity: 100, status: 'in-progress', version: 3, current_run: 1, payload: { runs: [] }, created_at: ago(5), updated_at: ago(1) });
    await insert('material_lots', { id: 'lot-1', brand_id: BRAND, material_code: 'MAT-AW', material_version: 1, lot_reference: 'LOT-1', unit: 'm', received_quantity: 50, status: 'quarantine', received_at: ago(6), created_at: ago(6), created_by: 'x', updated_at: ago(6), payload: {} });
    await insert('lab_dips', { id: 'dip-1', brand_id: BRAND, material_code: 'MAT-AW', material_colour_id: 'mc-1', colour_entry_id: 'c', colour_entry_version: 1, colour_code: 'RED', dip_reference: 'DIP-1', supplier_code: 'S1', status: 'submitted', submission_round: 1, requested_at: ago(10), requested_by: 'x', submitted_at: ago(4), version: 2, created_at: ago(10), updated_at: ago(4), payload: {} });
    await insert('compliance_documents', { id: 'doc-1', organisation_id: BRAND, document_number: 'UPD-1', document_type: 'upd', issuer_legal_entity_id: 'le', issuer_legal_entity_version_id: 'lev', status: 'draft', version: 1, payload: {}, created_at: ago(2), created_by: 'x', updated_at: ago(2), updated_by: 'x' });
    await insert('compliance_documents', { id: 'doc-2', organisation_id: BRAND, document_number: 'UPD-2', document_type: 'upd', issuer_legal_entity_id: 'le', issuer_legal_entity_version_id: 'lev', status: 'issued', version: 2, payload: {}, created_at: ago(2), created_by: 'x', updated_at: ago(2), updated_by: 'x' });

    // One active governed exception proves this is a projection of exception authority, not a copied task.
    await insert('operational_exceptions', {
      id: 'ex-await-1', owner_organisation_id: BRAND, dedupe_key: 'production-order:PO-AW-2:capacity_conflict:seed',
      entity_type: 'production-order', entity_id: 'PO-AW-2', entity_version: 2, entity_content_hash: null,
      category: 'capacity_conflict', severity: 'high', blocking: true, owner_role: 'owner', owner_user_id: null,
      thread_id: 'thread-seed', due_at: ago(-2), calendar_milestone_id: null,
      sla_policy_id: 'seed-sla', sla_policy_version: 1, sla_snapshot: { id: 'seed-sla', version: 1, resolutionMinutes: 120 },
      recovery_action: 'Recover supplier capacity.', business_impact: 'Delivery at risk.', source_event_id: 'seed-event',
      state: 'open', version: 1, escalation_count: 0, opened_by: 'system', opened_at: ago(1),
      assigned_at: null, resolved_at: null, closed_at: null, accepted_risk_decision_id: null,
      payload: { id: 'ex-await-1', entity: { type: 'production-order', id: 'PO-AW-2', version: 2 }, state: 'open' },
    });

    await insert('payment_schedules', { id: 'sch-1', brand_id: BRAND, production_order_number: 'PO-AW-1', supplier_code: 'S1', currency: 'EUR', total_amount_minor: 100_000, payment_terms_days: 30, version: 1, created_at: ago(40), created_by: 'x', updated_at: ago(40), payload: {} });
    const milestone = (id, sequence, trigger, amount, paidAt) => insert('payment_milestones', { id, schedule_id: 'sch-1', sequence, trigger_event: trigger, share_basis_points: 1000, amount_minor: amount, label_ru: `Веха ${sequence}`, label_en: `Milestone ${sequence}`, paid_at: paidAt, payload: {} });
    await milestone('ms-1', 1, 'order-confirmed', 30_000, null);
    await milestone('ms-2', 2, 'production-started', 30_000, null);
    await milestone('ms-3', 3, 'shipment-released', 40_000, null);
    await milestone('ms-0', 4, 'order-confirmed', 5_000, ago(30));

    // Shipment tail: one shipment nobody has received, one received only in part, one received for good;
    // one claim with no resolution, one that was resolved.
    const trade = { order_id: 'ord-attached', order_commit_snapshot_id: 'oc', supply_commitment_snapshot_id: 'sc', brand_id: BRAND, shop_id: SHOP };
    const shipment = (id, number, expectedIn) => insert('shipment_notice_snapshots', {
      id, ...trade, fulfillment_plan_snapshot_id: 'fp', shipment_number: number, carrier: 'DHL', service_level: 'air',
      shipped_at: ago(6), expected_delivery_at: new Date(Date.parse(now) + expectedIn * day).toISOString(),
      lines: JSON.stringify([{ lineId: 'line-0001', quantity: 10 }]), status: 'shipped', created_at: ago(6), content_hash: `hash-${id}`, payload: { id },
    });
    await shipment('sn-open', 'ASN-OPEN', 3);
    await shipment('sn-partial', 'ASN-PARTIAL', -1);
    await shipment('sn-done', 'ASN-DONE', -2);
    const receipt = (id, noticeId, complete) => insert('receipt_snapshots', {
      id, ...trade, fulfillment_plan_snapshot_id: 'fp', shipment_notice_snapshot_id: noticeId, receipt_reference: `GRN-${id}`, received_by: 'Склад',
      receipt_complete: complete, received_at: ago(1), lines: JSON.stringify([{ lineId: 'line-0001', receivedQuantity: 9 }]), status: 'received', created_at: ago(1), content_hash: `hash-${id}`, payload: { id },
    });
    await receipt('rc-partial', 'sn-partial', false);
    await receipt('rc-done', 'sn-done', true);
    const claim = (id, noticeId, submittedDaysAgo) => insert('receipt_discrepancy_claim_snapshots', {
      id, ...trade, order_version: 2, fulfillment_plan_snapshot_id: 'fp', shipment_notice_snapshot_id: noticeId, latest_receipt_snapshot_id: 'rc-done',
      receipt_discrepancy_snapshot_id: `disc-${id}`, receipt_discrepancy_content_hash: 'd', claim_reference: `CLM-${id}`, reason: 'Недостача', requested_remedy: 'credit',
      issue_count: 1, lines: JSON.stringify([{ lineId: 'line-0001' }]), status: 'submitted', submitted_at: ago(submittedDaysAgo), content_hash: `hash-${id}`, payload: { id },
    });
    await claim('clm-open', 'sn-done', 2);
    await claim('clm-closed', 'sn-done', 3);
    await insert('receipt_claim_resolution_snapshots', {
      id: 'res-1', claim_snapshot_id: 'clm-closed', claim_content_hash: 'c', ...trade, order_version: 2, fulfillment_plan_snapshot_id: 'fp', shipment_notice_snapshot_id: 'sn-done',
      latest_receipt_snapshot_id: 'rc-done', receipt_discrepancy_snapshot_id: 'disc-clm-closed', resolution_type: 'accepted-for-credit', resolution_reason: 'ok',
      status: 'resolved', resolved_at: ago(1), content_hash: 'hash-res-1', payload: {},
    });
  } finally {
    client.release();
  }
}
