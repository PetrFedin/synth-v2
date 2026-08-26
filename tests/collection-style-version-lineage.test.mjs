import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrganisation } from '../src/modules/organisations/public.mjs';
import { createMembership } from '../src/modules/access-control/public.mjs';
import { createWholesalePlatform } from '../src/application/platform.mjs';
import { createMemoryWholesaleStore } from '../src/infrastructure/memory-store.mjs';

async function fixture() {
  let tick = 0;
  let id = 0;
  const store = createMemoryWholesaleStore();
  const styleVersions = new Map();
  const productIdentityStore = Object.freeze({
    transaction(work) {
      return work(Object.freeze({
        getStyleVersion(styleVersionId) {
          return styleVersions.get(styleVersionId) ?? null;
        },
      }));
    },
  });
  const platform = createWholesalePlatform({
    store,
    productIdentityStore,
    clock: () => `2026-08-26T14:00:${String(tick++).padStart(2, '0')}.000Z`,
    nextId: (prefix) => `${prefix}_${++id}`,
  });

  await platform.registerOrganisation(
    'cmd-lineage-org-brand',
    'system',
    createOrganisation({ id: 'brand-1', type: 'brand', name: 'Syntha Brand' }),
  );
  await platform.grantMembership(
    'cmd-lineage-brand-owner',
    'system',
    createMembership({
      id: 'membership-lineage-brand-owner',
      organisationId: 'brand-1',
      organisationType: 'brand',
      userId: 'brand-owner',
      role: 'owner',
      createdAt: '2026-08-26T14:00:00.000Z',
    }),
  );
  const campaign = await platform.createCampaign('cmd-lineage-campaign', 'brand-owner', {
    brandId: 'brand-1',
    name: 'FW27 Campaign',
    season: 'FW27',
    startsAt: '2027-01-01T00:00:00.000Z',
    endsAt: '2027-02-01T00:00:00.000Z',
  });
  await platform.openCampaign('cmd-lineage-campaign-open', 'brand-owner', campaign.id);
  const collection = await platform.createCollection('cmd-lineage-collection', 'brand-owner', {
    campaignId: campaign.id,
    brandId: 'brand-1',
    name: 'Runway',
    currency: 'EUR',
  });

  return Object.freeze({ platform, store, styleVersions, campaign, collection });
}

function addStyleVersion(context, id, brandId = 'brand-1') {
  const styleVersion = Object.freeze({ id, brandId });
  context.styleVersions.set(id, styleVersion);
  return styleVersion;
}

test('collection stores exact Product Style Version lineage and emits one event', async () => {
  const context = await fixture();
  addStyleVersion(context, 'style-version-1');

  const assignment = await context.platform.assignStyleVersionToCollection(
    'cmd-lineage-assign-1',
    'brand-owner',
    { collectionId: context.collection.id, styleVersionId: 'style-version-1' },
  );

  assert.equal(assignment.collectionId, context.collection.id);
  assert.equal(assignment.brandId, 'brand-1');
  assert.equal(assignment.styleVersionId, 'style-version-1');
  assert.equal(assignment.assignedBy, 'brand-owner');

  const snapshot = context.store.snapshot();
  assert.deepEqual(snapshot.collectionStyleVersions, [assignment]);
  const events = snapshot.events.filter((event) => event.type === 'collection.style-version-assigned');
  assert.equal(events.length, 1);
  assert.equal(events[0].aggregateId, context.collection.id);
  assert.equal(events[0].payload.styleVersionId, 'style-version-1');
});

test('assigning the same Style Version twice is relation-idempotent', async () => {
  const context = await fixture();
  addStyleVersion(context, 'style-version-1');

  const first = await context.platform.assignStyleVersionToCollection(
    'cmd-lineage-assign-first',
    'brand-owner',
    { collectionId: context.collection.id, styleVersionId: 'style-version-1' },
  );
  const second = await context.platform.assignStyleVersionToCollection(
    'cmd-lineage-assign-second',
    'brand-owner',
    { collectionId: context.collection.id, styleVersionId: 'style-version-1' },
  );

  assert.deepEqual(second, first);
  const snapshot = context.store.snapshot();
  assert.equal(snapshot.collectionStyleVersions.length, 1);
  assert.equal(snapshot.events.filter((event) => event.type === 'collection.style-version-assigned').length, 1);
});

test('completed command replay returns the original result after later state transitions', async () => {
  const context = await fixture();
  addStyleVersion(context, 'style-version-1');
  const input = { collectionId: context.collection.id, styleVersionId: 'style-version-1' };

  const first = await context.platform.assignStyleVersionToCollection(
    'cmd-lineage-replay',
    'brand-owner',
    input,
  );
  await context.platform.publishCollection('cmd-lineage-replay-publish', 'brand-owner', context.collection.id);
  const replay = await context.platform.assignStyleVersionToCollection(
    'cmd-lineage-replay',
    'brand-owner',
    input,
  );

  assert.deepEqual(replay, first);
  const snapshot = context.store.snapshot();
  assert.equal(snapshot.collectionStyleVersions.length, 1);
  assert.equal(snapshot.events.filter((event) => event.type === 'collection.style-version-assigned').length, 1);
});

test('collection rejects a Style Version owned by another brand', async () => {
  const context = await fixture();
  addStyleVersion(context, 'style-version-foreign', 'brand-2');

  await assert.rejects(
    context.platform.assignStyleVersionToCollection(
      'cmd-lineage-cross-brand',
      'brand-owner',
      { collectionId: context.collection.id, styleVersionId: 'style-version-foreign' },
    ),
    (error) => error.code === 'COLLECTION_STYLE_VERSION_BRAND_MISMATCH',
  );

  assert.equal(context.store.snapshot().collectionStyleVersions.length, 0);
});

test('collection assortment is locked immediately after publication', async () => {
  const context = await fixture();
  addStyleVersion(context, 'style-version-1');
  await context.platform.publishCollection('cmd-lineage-publish', 'brand-owner', context.collection.id);

  await assert.rejects(
    context.platform.assignStyleVersionToCollection(
      'cmd-lineage-after-publish',
      'brand-owner',
      { collectionId: context.collection.id, styleVersionId: 'style-version-1' },
    ),
    (error) => error.code === 'COLLECTION_ASSORTMENT_LOCKED',
  );

  assert.equal(context.store.snapshot().collectionStyleVersions.length, 0);
});

test('a command id cannot be reused to assign another Style Version', async () => {
  const context = await fixture();
  addStyleVersion(context, 'style-version-1');
  addStyleVersion(context, 'style-version-2');

  await context.platform.assignStyleVersionToCollection(
    'cmd-lineage-shared',
    'brand-owner',
    { collectionId: context.collection.id, styleVersionId: 'style-version-1' },
  );

  await assert.rejects(
    context.platform.assignStyleVersionToCollection(
      'cmd-lineage-shared',
      'brand-owner',
      { collectionId: context.collection.id, styleVersionId: 'style-version-2' },
    ),
    (error) => error.code === 'COMMAND_ID_CONFLICT',
  );

  const snapshot = context.store.snapshot();
  assert.equal(snapshot.collectionStyleVersions.length, 1);
  assert.equal(snapshot.collectionStyleVersions[0].styleVersionId, 'style-version-1');
});
