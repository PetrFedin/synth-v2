import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { createMembership } from '../src/modules/access-control/public.mjs';
import { createOrganisation } from '../src/modules/organisations/public.mjs';
import { migratePostgres, waitForPostgres } from '../src/infrastructure/postgres-migrator.mjs';
import { createPostgresWholesaleRuntime } from '../src/runtime/postgres-runtime.mjs';

const databaseUrl = process.env.SYNTHA_V2_DATABASE_URL ?? process.env.DATABASE_URL;
const ownerEmail = process.env.SYNTHA_BOOTSTRAP_EMAIL ?? 'owner@syntha.local';
const demoPassword = process.env.SYNTHA_DEMO_PASSWORD ?? 'Syntha-demo-2027!';
if (!databaseUrl) throw new Error('SYNTHA_V2_DATABASE_URL or DATABASE_URL is required');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pool = new pg.Pool({ connectionString: databaseUrl, max: 4 });
const CREATED_AT = '2026-08-03T09:00:00.000Z';
const DATE = Object.freeze({
  campaignStart: '2027-01-10T09:00:00.000Z',
  campaignEnd: '2027-07-31T18:00:00.000Z',
  showroomOpen: '2027-01-15T09:00:00.000Z',
  showroomClose: '2027-06-30T18:00:00.000Z',
  invitationExpiry: '2028-01-31T18:00:00.000Z',
});

try {
  await waitForPostgres({
    pool,
    attempts: Number(process.env.SYNTHA_DB_READY_ATTEMPTS ?? 30),
    delayMs: Number(process.env.SYNTHA_DB_READY_DELAY_MS ?? 1_000),
  });
  await migratePostgres({ pool, migrationsDir: path.join(root, 'db', 'migrations') });
  const runtime = createPostgresWholesaleRuntime({ pool });

  const owner = await findUser(ownerEmail);
  if (!owner) throw new Error(`Owner ${ownerEmail} not found. Run npm run bootstrap:owner first.`);
  const brandMembership = await firstBrandMembership(owner.id);
  if (!brandMembership) throw new Error(`Owner ${ownerEmail} has no active brand membership.`);
  const brand = await organisationById(brandMembership.organisationId);
  if (!brand) throw new Error('Bootstrap brand organisation was not found.');
  const actorId = owner.id;

  const users = {
    sales: await ensureUser('user_demo_sales', 'sales@syntha.demo', 'Elena Petrova'),
    nordicBuyer: await ensureUser('user_demo_buyer_nordic', 'buyer.nordic@syntha.demo', 'Anna Nord'),
    archiveBuyer: await ensureUser('user_demo_buyer_archive', 'buyer.archive@syntha.demo', 'Mark Ellis'),
  };

  const shops = {
    nordic: await ensureOrganisation('shop_demo_nordic', 'shop', 'Nordic Concept Store'),
    archive: await ensureOrganisation('shop_demo_archive', 'shop', 'Archive Department Store'),
    gallery: await ensureOrganisation('shop_demo_gallery', 'shop', 'Gallery Retail Lab'),
    rejected: await ensureOrganisation('shop_demo_rejected', 'shop', 'Rejected Buyer Example'),
    revoked: await ensureOrganisation('shop_demo_revoked', 'shop', 'Revoked Partner Example'),
  };

  await ensureMembership(`membership_demo_${brand.id}_sales`, brand, users.sales, 'sales', actorId);
  for (const shop of Object.values(shops)) {
    await ensureMembership(`membership_demo_${shop.id}_owner`, shop, owner, 'owner', 'system');
  }
  await ensureMembership('membership_demo_nordic_buyer', shops.nordic, users.nordicBuyer, 'buyer', actorId);
  await ensureMembership('membership_demo_archive_buyer', shops.archive, users.archiveBuyer, 'buyer', actorId);

  await ensureRelationship(shops.nordic, 'active');
  await ensureRelationship(shops.archive, 'active');
  await ensureRelationship(shops.gallery, 'pending');
  await ensureRelationship(shops.rejected, 'rejected');
  await ensureRelationship(shops.revoked, 'revoked');

  const campaign = await runtime.platform.createCampaign('demo-v1-campaign-ss27-create', actorId, {
    brandId: brand.id,
    name: 'SS27 Wholesale Campaign',
    season: 'Spring/Summer 2027',
    startsAt: DATE.campaignStart,
    endsAt: DATE.campaignEnd,
  });
  await runtime.platform.openCampaign('demo-v1-campaign-ss27-open', actorId, campaign.id);

  await runtime.platform.createCampaign('demo-v1-campaign-prefall-create', actorId, {
    brandId: brand.id,
    name: 'Pre-Fall 2027 Planning',
    season: 'Pre-Fall 2027',
    startsAt: '2027-05-01T09:00:00.000Z',
    endsAt: '2027-10-31T18:00:00.000Z',
  });

  const collection = await runtime.platform.createCollection('demo-v1-collection-resort-create', actorId, {
    campaignId: campaign.id,
    brandId: brand.id,
    name: 'Resort 2027 Main Collection',
    currency: 'EUR',
  });
  await runtime.platform.publishCollection('demo-v1-collection-resort-publish', actorId, collection.id);

  await runtime.platform.createCollection('demo-v1-collection-core-create', actorId, {
    campaignId: campaign.id,
    brandId: brand.id,
    name: 'Core Essentials Draft',
    currency: 'EUR',
  });

  const skuDefinitions = [
    ['SYN-SS27-001', 'Sculpted Wool Blazer', 420, 2, 80, true],
    ['SYN-SS27-002', 'Silk Column Dress', 360, 2, 64, true],
    ['SYN-SS27-003', 'Technical Trench Coat', 510, 1, 42, true],
    ['SYN-SS27-004', 'Fluid Tailored Trouser', 190, 3, 120, true],
    ['SYN-SS27-005', 'Merino Rib Knit', 145, 4, 96, true],
    ['SYN-SS27-006', 'Leather Day Bag', 390, 1, 30, true],
    ['SYN-SS27-007', 'Architectural Poplin Shirt', 170, 3, 75, true],
    ['SYN-SS27-008', 'Bias Satin Skirt', 210, 2, 48, true],
    ['SYN-SS27-009', 'Cashmere Travel Coat', 620, 1, 18, true],
    ['SYN-SS27-010', 'Limited Atelier Jacket', 760, 1, 6, true],
    ['SYN-SS27-011', 'Draft Product Concept', 280, 2, 20, false],
    ['SYN-SS27-012', 'Sold-Out Preview Piece', 330, 1, 0, true],
  ];
  for (const [sku, name, wholesalePrice, minimumOrderQuantity, availableQuantity, publish] of skuDefinitions) {
    const item = await runtime.catalog.createSku(`demo-v1-sku-${sku}-create`, actorId, {
      sku,
      collectionId: collection.id,
      brandId: brand.id,
      name,
      wholesalePrice,
      currency: 'EUR',
      minimumOrderQuantity,
      availableQuantity,
    });
    if (publish) await runtime.catalog.publishSku(`demo-v1-sku-${sku}-publish`, actorId, item.sku);
  }

  const mainShowroom = await runtime.collaboration.createShowroom('demo-v1-showroom-main-create', actorId, {
    collectionId: collection.id,
    brandId: brand.id,
    name: 'SS27 Main Digital Showroom',
    opensAt: DATE.showroomOpen,
    closesAt: DATE.showroomClose,
  });
  await runtime.collaboration.openShowroom('demo-v1-showroom-main-open', actorId, mainShowroom.id);

  const privateShowroom = await runtime.collaboration.createShowroom('demo-v1-showroom-private-create', actorId, {
    collectionId: collection.id,
    brandId: brand.id,
    name: 'Private Buyer Preview',
    opensAt: '2027-02-01T09:00:00.000Z',
    closesAt: '2027-05-31T18:00:00.000Z',
  });
  await runtime.collaboration.openShowroom('demo-v1-showroom-private-open', actorId, privateShowroom.id);

  await runtime.collaboration.createShowroom('demo-v1-showroom-draft-create', actorId, {
    collectionId: collection.id,
    brandId: brand.id,
    name: 'Reorder Showroom Draft',
    opensAt: '2027-04-01T09:00:00.000Z',
    closesAt: '2027-07-15T18:00:00.000Z',
  });

  const invitations = {
    nordic: await ensureInvitation(mainShowroom, shops.nordic, 'accepted'),
    archive: await ensureInvitation(mainShowroom, shops.archive, 'accepted'),
  };
  await ensureInvitation(privateShowroom, shops.archive, 'pending');

  const dealScenario = await createOrderScenario({
    key: 'deal',
    shop: shops.nordic,
    campaign,
    collection,
    showroom: mainShowroom,
    invitation: invitations.nordic,
    lines: [
      { sku: 'SYN-SS27-001', quantity: 4 },
      { sku: 'SYN-SS27-002', quantity: 4 },
      { sku: 'SYN-SS27-006', quantity: 2 },
    ],
    outcome: 'deal',
  });

  const cancelledScenario = await createOrderScenario({
    key: 'cancelled',
    shop: shops.nordic,
    campaign,
    collection,
    showroom: mainShowroom,
    invitation: invitations.nordic,
    lines: [
      { sku: 'SYN-SS27-003', quantity: 2 },
      { sku: 'SYN-SS27-007', quantity: 3 },
    ],
    outcome: 'cancelled',
  });

  const draftSelectionScenario = await createOrderScenario({
    key: 'draft-selection',
    shop: shops.archive,
    campaign,
    collection,
    showroom: mainShowroom,
    invitation: invitations.archive,
    lines: [{ sku: 'SYN-SS27-005', quantity: 8 }],
    outcome: 'draft-selection',
  });

  await runtime.platform.startCycle('demo-v1-cycle-early-create', actorId, {
    brandId: brand.id,
    shopId: shops.archive.id,
    campaignId: campaign.id,
    collectionId: collection.id,
  });

  const threads = [];
  threads.push(await createThreadWithMessages({
    key: 'deal-delivery',
    ownerOrganisationId: brand.id,
    subjectType: 'deal',
    subjectId: dealScenario.deal.id,
    title: 'Delivery window and assortment approval',
    messages: [
      'Buyer assortment is approved. Confirming the final delivery split by door.',
      'Brand confirmed the first shipment for 15 February and the balance for 1 March.',
      'Commercial terms and packing requirements are aligned.',
    ],
  }));
  const cancelledThread = await createThreadWithMessages({
    key: 'order-cancelled',
    ownerOrganisationId: shops.nordic.id,
    subjectType: 'order',
    subjectId: cancelledScenario.order.id,
    title: 'Cancelled order review',
    messages: [
      'The duplicate order was identified before confirmation.',
      'Inventory reservation was released automatically after cancellation.',
    ],
  });
  threads.push(await runtime.collaborationCalendar.archiveThread('demo-v1-thread-order-cancelled-archive', actorId, cancelledThread.id));
  threads.push(await createThreadWithMessages({
    key: 'showroom-feedback',
    ownerOrganisationId: brand.id,
    subjectType: 'showroom',
    subjectId: mainShowroom.id,
    title: 'Showroom buyer feedback',
    messages: [
      'Strong response to outerwear and tailored silhouettes.',
      'Add a clearer size-curve note for the limited atelier jacket.',
    ],
  }));

  await runtime.collaborationCalendar.createEvent('demo-v1-calendar-buying-appointment-create', actorId, {
    ownerOrganisationId: brand.id,
    subjectType: 'showroom',
    subjectId: mainShowroom.id,
    eventType: 'meeting',
    visibility: 'trade',
    title: 'Nordic Concept Store buying appointment',
    description: 'Final line review and size-curve confirmation.',
    startsAt: '2027-02-10T10:00:00.000Z',
    endsAt: '2027-02-10T11:30:00.000Z',
    allDay: false,
    location: 'Syntha Digital Showroom',
    participantOrganisationIds: [shops.nordic.id],
    reminders: [{ minutesBefore: 1440, channel: 'in_app' }],
  });
  const shipmentEvent = await runtime.collaborationCalendar.createEvent('demo-v1-calendar-shipment-create', actorId, {
    ownerOrganisationId: brand.id,
    subjectType: 'deal',
    subjectId: dealScenario.deal.id,
    eventType: 'shipment',
    visibility: 'trade',
    title: 'First wholesale shipment',
    description: 'First confirmed delivery against the SS27 deal.',
    startsAt: '2027-02-15T08:00:00.000Z',
    endsAt: '2027-02-15T18:00:00.000Z',
    allDay: true,
    location: 'Milan Distribution Hub',
    participantOrganisationIds: [shops.nordic.id],
    reminders: [{ minutesBefore: 4320, channel: 'in_app' }],
  });
  await runtime.collaborationCalendar.updateEventStatus('demo-v1-calendar-shipment-start', actorId, shipmentEvent.id, 'in_progress');
  const sampleEvent = await runtime.collaborationCalendar.createEvent('demo-v1-calendar-sample-create', actorId, {
    ownerOrganisationId: brand.id,
    subjectType: 'collection',
    subjectId: collection.id,
    eventType: 'sample',
    visibility: 'organisation',
    title: 'Final sample approval',
    description: 'Close remaining fit notes before wholesale delivery.',
    startsAt: '2027-01-22T09:00:00.000Z',
    endsAt: '2027-01-22T13:00:00.000Z',
    allDay: false,
    location: 'Product Room A',
    participantOrganisationIds: [],
    reminders: [{ minutesBefore: 60, channel: 'in_app' }],
  });
  await runtime.collaborationCalendar.updateEventStatus('demo-v1-calendar-sample-complete', actorId, sampleEvent.id, 'completed');
  const cancelledEvent = await runtime.collaborationCalendar.createEvent('demo-v1-calendar-cancelled-create', actorId, {
    ownerOrganisationId: shops.nordic.id,
    subjectType: 'order',
    subjectId: cancelledScenario.order.id,
    eventType: 'deadline',
    visibility: 'trade',
    title: 'Cancelled duplicate order deadline',
    description: 'Retained for audit visibility.',
    startsAt: '2027-02-05T09:00:00.000Z',
    endsAt: '2027-02-05T10:00:00.000Z',
    allDay: false,
    location: '',
    participantOrganisationIds: [brand.id],
    reminders: [],
  });
  await runtime.collaborationCalendar.updateEventStatus('demo-v1-calendar-cancelled-status', actorId, cancelledEvent.id, 'cancelled');

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const projected = await runtime.notifications.projectPending({ limit: 1000 });
    if (!projected.length) break;
  }

  const workspace = await runtime.workspace.loadForActor(actorId, { limit: 500 });
  console.log(JSON.stringify({
    login: {
      owner: owner.email,
      ownerPassword: 'Use SYNTHA_BOOTSTRAP_PASSWORD from .env',
      demoPassword,
      demoAccounts: [users.sales.email, users.nordicBuyer.email, users.archiveBuyer.email],
    },
    organisations: workspace.organisations.length,
    relationships: workspace.relationships.length,
    campaigns: workspace.campaigns.length,
    collections: workspace.collections.length,
    catalogSkus: workspace.catalogSkus.length,
    showrooms: workspace.showrooms.length,
    invitations: workspace.invitations.length,
    cycles: workspace.cycles.length,
    selections: workspace.selections.length,
    orders: workspace.orders.length,
    deals: workspace.deals.length,
    calendarMilestones: workspace.calendar.length,
    calendarEvents: workspace.calendarEvents.length,
    collaborationThreads: workspace.collaborationThreads.length,
    collaborationMessages: workspace.collaborationMessages.length,
    threadIds: threads.map((thread) => thread.id),
    scenarioIds: {
      deal: dealScenario.deal.id,
      cancelledOrder: cancelledScenario.order.id,
      draftSelection: draftSelectionScenario.selection.id,
    },
  }, null, 2));

  async function ensureUser(id, email, displayName) {
    const existing = await findUser(email);
    if (existing) return existing;
    return runtime.auth.bootstrapUser({ id, email, password: demoPassword, displayName });
  }

  async function ensureOrganisation(id, type, name) {
    const existing = await organisationById(id);
    if (existing) return existing;
    const organisation = createOrganisation({ id, type, name });
    return runtime.platform.registerOrganisation(`demo-v1-organisation-${id}`, 'system', organisation);
  }

  async function ensureMembership(id, organisation, user, role, commandActorId) {
    const existing = await membershipFor(organisation.id, user.id);
    if (existing) return existing;
    const membership = createMembership({
      id,
      organisationId: organisation.id,
      organisationType: organisation.type,
      userId: user.id,
      role,
      createdAt: CREATED_AT,
    });
    return runtime.platform.grantMembership(`demo-v1-membership-${id}`, commandActorId, membership);
  }

  async function ensureRelationship(shop, targetStatus) {
    let relationship = await relationshipByTrade(brand.id, shop.id);
    if (!relationship) relationship = await runtime.partners.requestRelationship(`demo-v1-relationship-${shop.id}-request`, actorId, { brandId: brand.id, shopId: shop.id });
    if (targetStatus === 'pending') return relationship;
    if (targetStatus === 'active') return runtime.partners.acceptRelationship(`demo-v1-relationship-${shop.id}-accept`, actorId, relationship.id);
    if (targetStatus === 'rejected') return runtime.partners.rejectRelationship(`demo-v1-relationship-${shop.id}-reject`, actorId, relationship.id);
    if (targetStatus === 'revoked') {
      const active = await runtime.partners.acceptRelationship(`demo-v1-relationship-${shop.id}-accept`, actorId, relationship.id);
      return runtime.partners.revokeRelationship(`demo-v1-relationship-${shop.id}-revoke`, actorId, active.id);
    }
    return relationship;
  }

  async function ensureInvitation(showroom, shop, targetStatus) {
    let invitation = await invitationByAccess(showroom.id, shop.id);
    if (!invitation) {
      invitation = await runtime.partners.inviteShopToShowroom(`demo-v1-invitation-${showroom.id}-${shop.id}-create`, actorId, {
        showroomId: showroom.id,
        shopId: shop.id,
        expiresAt: DATE.invitationExpiry,
      });
    }
    if (targetStatus === 'accepted') return runtime.partners.acceptShowroomInvitation(`demo-v1-invitation-${showroom.id}-${shop.id}-accept`, actorId, invitation.id);
    return invitation;
  }

  async function createOrderScenario({ key, shop, campaign: scenarioCampaign, collection: scenarioCollection, showroom, invitation, lines, outcome }) {
    void invitation;
    const cycle = await runtime.platform.startCycle(`demo-v1-${key}-cycle-create`, actorId, {
      brandId: brand.id,
      shopId: shop.id,
      campaignId: scenarioCampaign.id,
      collectionId: scenarioCollection.id,
    });
    await runtime.platform.advanceCycle(`demo-v1-${key}-cycle-collection`, actorId, cycle.id, 'collection');
    await runtime.platform.advanceCycle(`demo-v1-${key}-cycle-showroom`, actorId, cycle.id, 'showroom');
    const selectionResult = await runtime.collaboration.createSelection(`demo-v1-${key}-selection-create`, actorId, {
      cycleId: cycle.id,
      showroomId: showroom.id,
    });
    let selection = selectionResult.selection;
    for (const line of lines) selection = await runtime.collaboration.upsertSelectionLine(`demo-v1-${key}-selection-${line.sku}`, actorId, selection.id, line);
    if (outcome === 'draft-selection') return { cycle: selectionResult.cycle, selection };
    const submitted = await runtime.collaboration.submitSelection(`demo-v1-${key}-selection-submit`, actorId, selection.id);
    const order = await runtime.orders.createOrderDraft(`demo-v1-${key}-order-create`, actorId, {
      selectionId: submitted.selection.id,
      terms: {
        incoterm: 'DAP',
        paymentDays: 30,
        prepaymentPercent: 20,
        deliveryStart: '2027-02-15',
        deliveryEnd: '2027-03-15',
      },
    });
    await runtime.orders.acceptTerms(`demo-v1-${key}-order-brand-accept`, actorId, { orderId: order.id, organisationId: brand.id });
    await runtime.orders.acceptTerms(`demo-v1-${key}-order-shop-accept`, actorId, { orderId: order.id, organisationId: shop.id });
    const attached = await runtime.orders.attachOrderToCycle(`demo-v1-${key}-order-attach`, actorId, order.id);
    if (outcome === 'cancelled') {
      const cancelled = await runtime.orders.cancelOrder(`demo-v1-${key}-order-cancel`, actorId, {
        orderId: order.id,
        reason: 'Duplicate buyer submission identified during commercial review.',
      });
      return { cycle: cancelled.cycle, selection: submitted.selection, order: cancelled.order };
    }
    const confirmed = await runtime.platform.confirmAndOpenDeal(`demo-v1-${key}-deal-open`, actorId, attached.cycle.id);
    return { cycle: confirmed.cycle, selection: submitted.selection, order: attached.order, deal: confirmed.deal };
  }

  async function createThreadWithMessages({ key, ownerOrganisationId, subjectType, subjectId, title, messages }) {
    const thread = await runtime.collaborationCalendar.createThread(`demo-v1-thread-${key}-create`, actorId, {
      ownerOrganisationId,
      subjectType,
      subjectId,
      title,
    });
    for (const [index, body] of messages.entries()) {
      await runtime.collaborationCalendar.postMessage(`demo-v1-thread-${key}-message-${index + 1}`, actorId, thread.id, { body });
    }
    return thread;
  }

  async function findUser(email) {
    const result = await pool.query(
      `SELECT id, email, display_name AS "displayName", status
         FROM auth_users
        WHERE email_normalized = lower($1)`,
      [email],
    );
    return result.rows[0];
  }

  async function firstBrandMembership(userId) {
    const result = await pool.query(
      `SELECT payload
         FROM memberships
        WHERE user_id = $1 AND organisation_type = 'brand' AND status = 'active'
        ORDER BY id
        LIMIT 1`,
      [userId],
    );
    return result.rows[0]?.payload;
  }

  async function organisationById(id) {
    const result = await pool.query('SELECT payload FROM organisations WHERE id = $1', [id]);
    return result.rows[0]?.payload;
  }

  async function membershipFor(organisationId, userId) {
    const result = await pool.query('SELECT payload FROM memberships WHERE organisation_id = $1 AND user_id = $2', [organisationId, userId]);
    return result.rows[0]?.payload;
  }

  async function relationshipByTrade(brandId, shopId) {
    const result = await pool.query('SELECT payload FROM counterparty_relationships WHERE brand_id = $1 AND shop_id = $2', [brandId, shopId]);
    return result.rows[0]?.payload;
  }

  async function invitationByAccess(showroomId, shopId) {
    const result = await pool.query('SELECT payload FROM showroom_invitations WHERE showroom_id = $1 AND shop_id = $2', [showroomId, shopId]);
    return result.rows[0]?.payload;
  }
} finally {
  await pool.end();
}
