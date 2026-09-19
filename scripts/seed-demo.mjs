// Build the demonstration environment.
//
// A demonstration is a claim about the product, so it is built the way a customer builds: through the
// same services, under the same invariants, with the same separations of duty. Nothing here writes a
// row the application could not have written itself. If a step in this script breaks, it breaks for a
// customer too, which is the point of seeding this way rather than with INSERT statements.
//
// Three properties it holds to:
//
//   * idempotent. Every step looks for its own fixture before creating it, so running the script
//     twice changes nothing. Repeated acceptance runs are what left the database with seven
//     near-identical campaigns named R1 to R5; a demonstration cannot accumulate like that.
//   * every role is a real account. The platform enforces that an inspector cannot approve their own
//     disposition, that a supplier is not the brand, and that a buyer is not the seller — and none of
//     that can be shown from a single login. Four people sign in here because four people have to.
//   * one coherent season, end to end. A screen with nothing in it demonstrates nothing, so the
//     script carries one collection from a planned slot through to a released shipment and a
//     confirmed wholesale order.
//
//   SYNTHA_V2_DATABASE_URL=postgresql://... node scripts/seed-demo.mjs
//
// Passwords come from the environment, with local defaults, because a demonstration environment is
// still an environment somebody can reach.
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { createMembership } from '../src/modules/access-control/public.mjs';
import { migratePostgres, waitForPostgres } from '../src/infrastructure/postgres-migrator.mjs';
import { createPostgresWholesaleRuntime } from '../src/runtime/postgres-runtime.mjs';

const databaseUrl = process.env.SYNTHA_V2_DATABASE_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('SYNTHA_V2_DATABASE_URL is required');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = path.join(root, 'db', 'migrations');

const PEOPLE = Object.freeze({
  owner: { email: 'owner@syntha.local', password: process.env.SYNTHA_DEMO_OWNER_PASSWORD ?? 'local-owner-password-2026', name: 'Syntha Owner' },
  quality: { email: 'quality@syntha.local', password: process.env.SYNTHA_DEMO_QUALITY_PASSWORD ?? 'local-quality-password-2026', name: 'Ирина Соколова' },
  buyer: { email: 'buyer@nordhaus.example', password: process.env.SYNTHA_DEMO_BUYER_PASSWORD ?? 'local-buyer-password-2026', name: 'Jonas Herrmann' },
  supplier: { email: 'rep@atmosphere.example', password: process.env.SYNTHA_DEMO_SUPPLIER_PASSWORD ?? 'local-supplier-password-2026', name: 'Mei Lin' },
});

const SHOP_ID = 'demo-shop-nordhaus';
const SHOP_NAME = 'Nordhaus Retail';

const pool = new pg.Pool({ connectionString: databaseUrl, max: 4 });
const log = [];
const note = (step, detail) => { log.push({ step, detail }); process.stdout.write(`  ${step}: ${detail}\n`); };

let sequence = 0;
const command = (label) => `demo-${label}-${Date.now().toString(36)}-${++sequence}`;

try {
  await waitForPostgres(/** @type {any} */ ({ pool, attempts: 30, delayMs: 1_000 }));
  await migratePostgres(/** @type {any} */ ({ pool, migrationsDir }));
  const runtime = createPostgresWholesaleRuntime({ pool, migrationsDir });

  process.stdout.write('Syntha demonstration environment\n');

  // --- People -------------------------------------------------------------------------------
  const accounts = {};
  for (const [key, person] of Object.entries(PEOPLE)) {
    const existing = await pool.query('SELECT id FROM auth_users WHERE email_normalized = lower($1)', [person.email]);
    if (existing.rowCount) { accounts[key] = existing.rows[0].id; note('account', `${person.email} already exists`); continue; }
    const created = await runtime.auth.bootstrapUser({ id: `demo-user-${key}`, email: person.email, password: person.password, displayName: person.name });
    accounts[key] = created.id;
    note('account', `${person.email} created`);
  }

  const brandRow = await pool.query("SELECT id FROM organisations WHERE type = 'brand' AND id IN (SELECT organisation_id FROM memberships WHERE user_id = $1 AND status = 'active') LIMIT 1", [accounts.owner]);
  if (!brandRow.rowCount) throw new Error('The demonstration brand does not exist; run bootstrap-owner first');
  const brandId = brandRow.rows[0].id;
  note('brand', brandId);

  // The quality approver. A run's inspector may not sign off their own disposition, so a second
  // person in the brand is not a nicety here — without one the quality chain cannot be finished.
  await ensureMembership(runtime, brandId, accounts.quality, 'admin', accounts.owner, 'brand');

  // --- The retailer -------------------------------------------------------------------------
  const shopExists = await pool.query('SELECT id FROM organisations WHERE id = $1', [SHOP_ID]);
  if (!shopExists.rowCount) {
    await runtime.platform.registerOrganisation(command('shop'), 'system', { id: SHOP_ID, type: 'shop', name: SHOP_NAME });
    note('retailer', `${SHOP_NAME} registered`);
  } else note('retailer', `${SHOP_NAME} already exists`);
  await ensureMembership(runtime, SHOP_ID, accounts.buyer, 'owner', accounts.buyer, 'shop');

  // --- The commercial season ----------------------------------------------------------------
  // The wholesale half of the product was the half an investor could not see: no relationship, no
  // invitation, no selection, no order, so five sections rendered their empty state. This carries one
  // published collection all the way to a confirmed order with a deal space open on it.
  const collection = await pickDemoCollection(pool, brandId);
  note('collection', `${collection.id} (${collection.campaignName})`);

  const relationshipId = await ensureRelationship(runtime, pool, brandId, accounts.owner, accounts.buyer);
  const showroom = await ensureShowroom(runtime, pool, collection, brandId, accounts.owner);
  await ensureInvitation(runtime, pool, showroom.id, accounts.owner, accounts.buyer);
  // A buyer does not browse the brand's own catalogue: they browse the catalogue the brand published
  // for them, at the prices published for them, shipping to one of their own doors. All three are
  // real objects here, because that is the difference between a demonstration and a mock-up.
  const door = await ensureRetailDoor(runtime, pool, accounts.buyer);
  await ensureBuyerCatalog(runtime, pool, collection.id, showroom.id, accounts.owner);

  const cycle = await ensureCycle(runtime, pool, { brandId, shopId: SHOP_ID, campaignId: collection.campaignId, collectionId: collection.id }, accounts.buyer);
  const selection = await ensureSelection(runtime, pool, cycle, showroom.id, collection.id, accounts.buyer, door.id);
  await ensureOrder(runtime, pool, cycle, selection, accounts.buyer, accounts.owner);

  // --- Quality ------------------------------------------------------------------------------
  // Inspections sat at review-pending because the only account in the brand was the one that ran
  // them, and a run's inspector may not sign off its own disposition. That rule is a feature, and a
  // demonstration should show it being satisfied rather than tripped over.
  await releaseQuality(runtime, pool, brandId, accounts.quality);

  // --- The supplier's side of the table -------------------------------------------------------
  await ensurePortalAccess(runtime, pool, brandId, accounts.owner);

  process.stdout.write('\nSigning in as:\n');
  for (const [key, person] of Object.entries(PEOPLE)) {
    process.stdout.write(`  ${person.email.padEnd(26)} ${person.password.padEnd(32)} ${describeRole(key)}\n`);
  }
  process.stdout.write('\n');
  process.stdout.write(`${log.length} step(s) recorded.\n`);
} finally {
  await pool.end();
}

function describeRole(key) {
  return {
    owner: 'бренд — владелец',
    quality: 'бренд — приёмка качества',
    buyer: `${SHOP_NAME} — байер`,
    supplier: 'портал поставщика',
  }[key] ?? key;
}

async function ensureMembership(runtime, organisationId, userId, role, actorId, organisationType) {
  const existing = await runtime.store.transaction(async (tx) => tx.getMembership(organisationId, userId));
  if (existing) { note('membership', `${userId} already ${existing.role} of ${organisationId}`); return; }
  const membership = createMembership({
    id: `demo-membership-${organisationId}-${userId}`.replace(/[^\w-]/g, '-'),
    organisationId, organisationType, userId, role, createdAt: new Date().toISOString(),
  });
  // The very first membership of an organisation can only be granted by the system actor: nobody is
  // inside it yet to do the granting. Every later one is granted by a member who may.
  const members = await runtime.store.transaction(async (tx) => tx.listMembershipsByOrganisation(organisationId));
  const granter = members.length === 0 ? 'system' : actorId;
  await runtime.platform.grantMembership(command('membership'), granter, membership);
  note('membership', `${userId} granted ${role} of ${organisationId}`);
}

async function pickDemoCollection(pool, brandId) {
  // The collection with the most published SKUs and a showroom already over it: the demonstration
  // should walk the richest season present rather than create a parallel one beside it.
  const result = await pool.query(
    `SELECT c.id, c.campaign_id, campaign.payload ->> 'name' AS campaign_name,
            (SELECT count(*) FROM catalog_skus s WHERE s.collection_id = c.id AND s.status = 'published') AS published
       FROM collections c
       JOIN campaigns campaign ON campaign.id = c.campaign_id
      WHERE c.brand_id = $1 AND c.status = 'published'
      ORDER BY (campaign.payload ->> 'name') LIKE '%DEMO%' DESC, published DESC, c.id
      LIMIT 1`,
    [brandId],
  );
  if (!result.rowCount) throw new Error('No published collection to demonstrate');
  const row = result.rows[0];
  if (Number(row.published) === 0) throw new Error(`Collection ${row.id} has no published SKU`);
  return { id: row.id, campaignId: row.campaign_id, campaignName: row.campaign_name };
}

async function ensureRelationship(runtime, pool, brandId, ownerId, buyerId) {
  const existing = await pool.query('SELECT id, status FROM counterparty_relationships WHERE brand_id = $1 AND shop_id = $2', [brandId, SHOP_ID]);
  let id = existing.rows[0]?.id;
  if (!id) {
    const created = await runtime.partners.requestRelationship(command('relationship'), ownerId, { brandId, shopId: SHOP_ID });
    id = created.id;
    note('relationship', 'requested by the brand');
  } else note('relationship', `already ${existing.rows[0].status}`);
  const status = (await pool.query('SELECT status FROM counterparty_relationships WHERE id = $1', [id])).rows[0]?.status;
  // Only the shop can accept a request addressed to it, which is exactly why the buyer is a real
  // account rather than a row.
  if (status !== 'active') {
    await runtime.partners.acceptRelationship(command('relationship-accept'), buyerId, id);
    note('relationship', 'accepted by the retailer');
  }
  return id;
}

async function ensureShowroom(runtime, pool, collection, brandId, ownerId) {
  const existing = await pool.query("SELECT id, status FROM showrooms WHERE collection_id = $1 ORDER BY status = 'open' DESC LIMIT 1", [collection.id]);
  if (existing.rowCount) {
    const row = existing.rows[0];
    if (row.status !== 'open') { await runtime.collaboration.openShowroom(command('showroom-open'), ownerId, row.id); note('showroom', 'opened'); }
    else note('showroom', `${row.id} already open`);
    return { id: row.id };
  }
  const now = Date.now();
  const created = await runtime.collaboration.createShowroom(command('showroom'), ownerId, {
    collectionId: collection.id, brandId, name: 'SS27 Paris Showroom',
    opensAt: new Date(now - 7 * 86400000).toISOString(), closesAt: new Date(now + 120 * 86400000).toISOString(),
  });
  await runtime.collaboration.openShowroom(command('showroom-open'), ownerId, created.id);
  note('showroom', `${created.id} created and opened`);
  return created;
}

async function ensureInvitation(runtime, pool, showroomId, ownerId, buyerId) {
  const existing = await pool.query('SELECT id, status FROM showroom_invitations WHERE showroom_id = $1 AND shop_id = $2', [showroomId, SHOP_ID]);
  let id = existing.rows[0]?.id;
  if (!id) {
    const created = await runtime.partners.inviteShopToShowroom(command('invitation'), ownerId, {
      showroomId, shopId: SHOP_ID, expiresAt: new Date(Date.now() + 60 * 86400000).toISOString(),
    });
    id = created.id;
    note('invitation', 'sent to the retailer');
  } else note('invitation', `already ${existing.rows[0].status}`);
  const status = (await pool.query('SELECT status FROM showroom_invitations WHERE id = $1', [id])).rows[0]?.status;
  if (status !== 'accepted') {
    await runtime.partners.acceptShowroomInvitation(command('invitation-accept'), buyerId, id);
    note('invitation', 'accepted by the retailer');
  }
  return id;
}

async function ensureRetailDoor(runtime, pool, buyerId) {
  const existing = await pool.query('SELECT id FROM retail_doors WHERE shop_id = $1 ORDER BY id LIMIT 1', [SHOP_ID]);
  if (existing.rowCount) { note('retail door', `${existing.rows[0].id} already exists`); return existing.rows[0]; }
  const created = await runtime.retailDoors.createRetailDoor(command('door'), buyerId, {
    shopId: SHOP_ID, code: 'BER-MITTE', name: 'Nordhaus Berlin Mitte',
    shipToAddress: { countryCode: 'DE', postalCode: '10117', city: 'Berlin', line1: 'Friedrichstraße 68' },
  });
  note('retail door', `${created.code} created`);
  return created;
}

async function ensureBuyerCatalog(runtime, pool, collectionId, showroomId, ownerId) {
  const existing = await pool.query('SELECT id FROM buyer_catalog_versions WHERE showroom_id = $1 AND shop_id = $2 LIMIT 1', [showroomId, SHOP_ID]);
  if (existing.rowCount) { note('buyer catalogue', `${existing.rows[0].id} already published`); return existing.rows[0]; }
  const publication = await pool.query('SELECT id FROM commercial_publications WHERE collection_id = $1 ORDER BY published_at DESC LIMIT 1', [collectionId]);
  if (!publication.rowCount) throw new Error(`Collection ${collectionId} has no commercial publication to publish a buyer catalogue from`);
  const result = await runtime.commercialPublication.publishBuyerCatalog(command('buyer-catalog'), ownerId, publication.rows[0].id, { showroomId, shopId: SHOP_ID });
  note('buyer catalogue', `${result.buyerCatalogVersion.id} published for ${SHOP_NAME}`);
  return result.buyerCatalogVersion;
}

async function ensureCycle(runtime, pool, input, buyerId) {
  const existing = await pool.query('SELECT id, stage FROM commercial_cycles WHERE brand_id = $1 AND shop_id = $2 AND collection_id = $3 LIMIT 1', [input.brandId, input.shopId, input.collectionId]);
  if (existing.rowCount) { note('cycle', `${existing.rows[0].id} at ${existing.rows[0].stage}`); return existing.rows[0]; }
  const created = await runtime.platform.startCycle(command('cycle'), buyerId, input);
  note('cycle', `${created.id} started at ${created.stage}`);
  return created;
}

// The cycle advances one stage at a time on purpose — it is the season's own state machine — so the
// seed walks it rather than jumping, exactly as the screens do.
async function advanceCycleTo(runtime, pool, cycleId, targetStage, actorId) {
  const stages = ['campaign', 'collection', 'showroom', 'selection', 'order-builder', 'deal'];
  for (;;) {
    const stage = (await pool.query('SELECT stage FROM commercial_cycles WHERE id = $1', [cycleId])).rows[0]?.stage;
    const at = stages.indexOf(stage);
    const want = stages.indexOf(targetStage);
    if (at < 0 || want < 0 || at >= want) return stage;
    await runtime.platform.advanceCycle(command('cycle-advance'), actorId, cycleId, stages[at + 1]);
    note('cycle', `advanced to ${stages[at + 1]}`);
  }
}

async function ensureSelection(runtime, pool, cycle, showroomId, collectionId, buyerId, retailDoorId) {
  await advanceCycleTo(runtime, pool, cycle.id, 'showroom', buyerId);
  const existing = await pool.query('SELECT id, status FROM selections WHERE cycle_id = $1 LIMIT 1', [cycle.id]);
  if (existing.rowCount && existing.rows[0].status === 'submitted') { note('selection', `${existing.rows[0].id} already submitted`); return existing.rows[0]; }
  let selection = existing.rows[0];
  if (!selection) {
    // createSelection also advances the cycle, so it answers with both; the selection is the half
    // this step is about.
    const result = await runtime.collaboration.createSelection(command('selection'), buyerId, { cycleId: cycle.id, showroomId, retailDoorId });
    selection = result.selection ?? result;
    note('selection', `${selection.id} created`);
  }
  // The buyer picks from the catalogue the brand published to them, not from the brand's own
  // register: those are different lists, and which one a selection is built from is the whole point
  // of publishing. Quantities differ by product the way a real buying sheet does.
  const catalogue = await pool.query(
    `SELECT line ->> 'sku' AS sku,
            COALESCE((line ->> 'minimumOrderQuantity')::integer, 1) AS moq,
            COALESCE((line -> 'availability' ->> 'quantity')::integer, 0) AS available
       FROM buyer_catalog_versions AS catalogue,
            LATERAL jsonb_array_elements(catalogue.payload -> 'lines') AS line
      WHERE catalogue.showroom_id = $1 AND catalogue.shop_id = $2
      ORDER BY catalogue.published_at DESC, line ->> 'sku'`,
    [showroomId, SHOP_ID],
  );
  if (!catalogue.rowCount) throw new Error('The published buyer catalogue holds no line to select');
  const quantities = [180, 640, 240, 420];
  for (const [index, row] of catalogue.rows.entries()) {
    const wanted = quantities[index % quantities.length];
    const quantity = Math.max(Number(row.moq), Math.min(wanted, Number(row.available) || wanted));
    await runtime.collaboration.upsertSelectionLine(command('selection-line'), buyerId, selection.id, { sku: row.sku, quantity });
    note('selection line', `${row.sku} × ${quantity}`);
  }
  await runtime.collaboration.submitSelection(command('selection-submit'), buyerId, selection.id);
  note('selection', 'submitted to the brand');
  return selection;
}

async function ensureOrder(runtime, pool, cycle, selection, buyerId, ownerId) {
  const brandId = (await pool.query('SELECT brand_id FROM commercial_cycles WHERE id = $1', [cycle.id])).rows[0].brand_id;
  const readOrder = async () => (await pool.query('SELECT id, status, version, payload FROM orders WHERE cycle_id = $1 LIMIT 1', [cycle.id])).rows[0];

  let order = await readOrder();
  if (!order) {
    await advanceCycleTo(runtime, pool, cycle.id, 'order-builder', ownerId);
    const now = Date.now();
    const created = await runtime.orders.createOrderDraft(command('order'), buyerId, {
      selectionId: selection.id,
      retailDoorId: (await pool.query('SELECT retail_door_id FROM selections WHERE id = $1', [selection.id])).rows[0]?.retail_door_id ?? null,
      terms: {
        incoterm: 'DDP', paymentDays: 45, prepaymentPercent: 30,
        deliveryStart: new Date(now + 150 * 86400000).toISOString(),
        deliveryEnd: new Date(now + 180 * 86400000).toISOString(),
      },
    });
    note('order', `${created.id} drafted by the retailer`);
    order = await readOrder();
  } else note('order', `${order.id} already ${order.status}`);

  // Both sides accept, separately. An order one party signed is a quotation; it becomes an order when
  // the other one answers, and the two answers come from two accounts because they are two decisions.
  for (const [organisationId, actorId, who] of [[SHOP_ID, buyerId, 'retailer'], [brandId, ownerId, 'brand']]) {
    order = await readOrder();
    const accepted = new Set(order.payload.acceptedOrganisationIds ?? []);
    if (accepted.has(organisationId)) { note('order', `already accepted by the ${who}`); continue; }
    await runtime.orders.acceptTerms(command('order-accept'), actorId, { orderId: order.id, organisationId, expectedVersion: order.version });
    note('order', `accepted by the ${who}`);
  }

  order = await readOrder();
  if (order.status === 'ready') {
    await runtime.orders.attachOrderToCycle(command('order-attach'), ownerId, { orderId: order.id, expectedVersion: order.version });
    note('order', 'committed and attached');
    order = await readOrder();
  }

  const stage = (await pool.query('SELECT stage FROM commercial_cycles WHERE id = $1', [cycle.id])).rows[0].stage;
  if (stage === 'order-builder') {
    await advanceCycleTo(runtime, pool, cycle.id, 'order', ownerId);
    await runtime.platform.attachOrder(command('cycle-order'), ownerId, cycle.id, order.payload);
    note('cycle', 'order attached to the season');
  }

  const deal = await pool.query('SELECT id FROM deals WHERE order_id = $1', [order.id]);
  if (!deal.rowCount) {
    await runtime.platform.confirmAndOpenDeal(command('deal'), ownerId, cycle.id);
    note('deal space', 'opened on the confirmed order');
  } else note('deal space', `${deal.rows[0].id} already open`);
  return order;
}

async function releaseQuality(runtime, pool, brandId, approverId) {
  const pending = await pool.query(
    `SELECT payload ->> 'inspectionCode' AS code, version, payload
       FROM quality_inspections
      WHERE brand_id = $1 AND status = 'review-pending'
      ORDER BY payload ->> 'inspectionCode'`,
    [brandId],
  );
  if (!pending.rowCount) { note('quality', 'nothing awaiting a decision'); return; }
  for (const row of pending.rows) {
    const run = (row.payload.runs ?? []).at(-1);
    // The disposition cannot be more lenient than the run recommended, so the seed follows the run
    // rather than releasing everything: a demonstration where every batch passes shows nothing.
    // The run computes a recommendation — pass, rework or reject — and the decision may be stricter
    // than it but never more lenient. The seed follows the run rather than releasing on principle.
    const decision = { pass: 'release', rework: 'rework', reject: 'reject' }[run?.recommendation] ?? 'reject';
    try {
      await runtime.finalQuality.review(command('quality-review'), approverId, row.code, {
        expectedVersion: row.version,
        decision,
        ...(decision === 'release' ? { releaseCode: `REL-${row.code}`.slice(0, 64) } : {}),
        notes: decision === 'release'
          ? 'Партия принята: отклонений от согласованных допусков нет.'
          : 'Партия отправлена на доработку по результатам инспекции.',
      });
      note('quality', `${row.code} → ${decision}`);
    } catch (error) {
      note('quality', `${row.code} left as is (${error.code ?? error.message})`);
    }
  }
}

async function ensurePortalAccess(runtime, pool, brandId, ownerId) {
  const supplier = await pool.query("SELECT supplier_code FROM suppliers WHERE brand_id = $1 AND status = 'qualified' ORDER BY supplier_code LIMIT 1", [brandId]);
  if (!supplier.rowCount) { note('portal access', 'no qualified supplier to invite'); return; }
  const code = supplier.rows[0].supplier_code;
  const existing = await pool.query("SELECT status FROM supplier_portal_grants WHERE supplier_code = $1 AND invited_email = $2", [code, PEOPLE.supplier.email]);
  if (existing.rowCount && existing.rows[0].status === 'active') { note('portal access', `${PEOPLE.supplier.email} already reads ${code}`); return; }
  await runtime.sourcing.grantPortalAccess(command('portal'), ownerId, code, { email: PEOPLE.supplier.email, contactName: PEOPLE.supplier.name });
  note('portal access', `${PEOPLE.supplier.email} invited to ${code}`);
}
