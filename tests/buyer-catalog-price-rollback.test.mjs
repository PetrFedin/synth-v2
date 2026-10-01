import assert from 'node:assert/strict';
import test from 'node:test';
import { createCommercialPublicationService } from '../src/application/commercial-publication-service.mjs';
import { createProjectionBackedCommercialPublication } from '../src/modules/commercial-publication/public.mjs';
import { createCommercialPublicationRoutes } from '../src/http/commercial-publication-routes.mjs';
import { wholesaleV2CompleteOpenApi as wholesaleV2OpenApi } from '../src/http/v2-complete-openapi.mjs';
import { collection, projection, publishedAt } from './fixtures/commercial-publication-v2.mjs';

// O-05 (аудит «карта процессов»): цену каталога байера нельзя было откатить. Версии цен
// неизменяемы и только добавляются; ошибочную цену нельзя ни убрать, ни вернуть прежнюю — только
// вручную перепубликовать её через новые overrides, а `content_hash` уникален, так что даже это
// столкнулось бы с оригиналом. Откат выпускает НОВУЮ версию с содержимым прежней.

function fixture() {
  let state = { commands: new Map(), prices: [], catalogs: [], events: [] };
  let tick = 0;
  const publication = createProjectionBackedCommercialPublication({ id: 'publication:1', collection, commercialProjection: projection(), publishedAt });
  const context = {
    membership: { status: 'active', role: 'owner', organisationId: 'brand:1', userId: 'owner:1' },
    showroom: { id: 'showroom:1', brandId: 'brand:1', collectionId: 'collection:1', status: 'open' },
    invitation: { id: 'invite:1', showroomId: 'showroom:1', brandId: 'brand:1', shopId: 'shop:1', status: 'accepted', expiresAt: '2099-12-31T00:00:00.000Z' },
  };
  const read = (value) => structuredClone(value);
  const latest = (source) => [...source.catalogs].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || b.id.localeCompare(a.id))[0];
  const commercialStore = {
    async getCommercialPublication() { return publication; },
    async getBuyerCatalogVersion(id) { return read(state.catalogs.find((row) => row.id === id)); },
    async getBuyerCatalogForAccess() { return read(latest(state)); },
    async listBuyerCatalogVersionsForAccess(showroomId, shopId, { limit }) {
      return [...state.catalogs].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || b.id.localeCompare(a.id)).slice(0, limit).map(read);
    },
    async transaction(work) {
      const draft = structuredClone(state);
      draft.commands = new Map(state.commands);
      const result = await work({
        async getCommand(id) { return draft.commands.get(id); },
        async insertCommand(row) { draft.commands.set(row.id, row); },
        async insertPriceListVersion(row) {
          assert.equal(draft.prices.some((price) => price.contentHash === row.contentHash), false, 'content_hash is unique in price_list_versions');
          draft.prices.push(row);
        },
        async insertBuyerCatalogVersion(row) {
          assert.equal(draft.catalogs.some((catalog) => catalog.contentHash === row.contentHash), false, 'content_hash is unique in buyer_catalog_versions');
          draft.catalogs.push(row);
        },
        async appendOutbox(row) { draft.events.push(row); },
        async getLatestBuyerCatalogForAccess() { return read(latest(draft)); },
      });
      state = draft;
      return result;
    },
  };
  const wholesaleStore = {
    async transaction(work) {
      return work({
        async getShowroom() { return context.showroom; },
        async getMembership(organisationId, actorId) { return organisationId === 'brand:1' && actorId === context.membership.userId ? context.membership : undefined; },
        async getRelationshipByTrade(brandId, shopId) { return Object.freeze({ id: 'relationship:1', brandId, shopId, status: 'active' }); },
        async getShowroomInvitationByAccess() { return context.invitation; },
      });
    },
  };
  let sequence = 0;
  const service = createCommercialPublicationService({
    commercialStore,
    wholesaleStore,
    clock: () => new Date(Date.parse(publishedAt) + (++tick) * 60_000).toISOString(),
    nextId: (prefix) => `${prefix}:${++sequence}`,
  });
  return { service, state: () => state, context };
}

async function twoVersions(f) {
  const first = await f.service.publishBuyerCatalog('cmd:a', 'owner:1', 'publication:1', { showroomId: 'showroom:1', shopId: 'shop:1', priceOverrides: [{ productSkuId: 'psku:1', wholesalePriceMinor: 95000 }] });
  const second = await f.service.publishBuyerCatalog('cmd:b', 'owner:1', 'publication:1', { showroomId: 'showroom:1', shopId: 'shop:1', priceOverrides: [{ productSkuId: 'psku:1', wholesalePriceMinor: 70000 }] });
  return { first: first.buyerCatalogVersion, second: second.buyerCatalogVersion };
}

test('a wrong price can be rolled back: a NEW version carries the earlier content and nothing is edited or deleted', async () => {
  const f = fixture();
  const { first, second } = await twoVersions(f);
  assert.equal(second.lines[0].wholesalePriceMinor, 70000);

  const result = await f.service.rollbackBuyerCatalog('cmd:rollback', 'owner:1', first.id, { expectedLatestBuyerCatalogVersionId: second.id });

  const restored = result.buyerCatalogVersion;
  assert.notEqual(restored.id, first.id);
  assert.notEqual(restored.id, second.id);
  assert.equal(restored.lines[0].wholesalePriceMinor, 95000, 'the earlier price is back');
  assert.equal(restored.lines[0].unitPrice, 950);
  assert.equal(restored.restoredFromBuyerCatalogVersionId, first.id);
  assert.equal(restored.supersedesBuyerCatalogVersionId, second.id);
  assert.equal(result.priceListVersion.restoredFromBuyerCatalogVersionId, first.id);
  assert.equal(restored.priceListVersionId, result.priceListVersion.id);
  // история цела: три версии, исходные не тронуты
  assert.equal(f.state().catalogs.length, 3);
  assert.equal(f.state().catalogs[0].lines[0].wholesalePriceMinor, 95000);
  assert.equal(f.state().catalogs[1].lines[0].wholesalePriceMinor, 70000);
  // и именно она теперь «последняя» — ту видит байер
  assert.equal((await f.service.getBuyerCatalogForAccess('showroom:1', 'shop:1')).id, restored.id);
  assert.ok(f.state().events.some((event) => event.type === 'buyer-catalog-version.rolled-back'));
});

test('rollback is idempotent on replay and can be repeated after a newer price without a hash collision', async () => {
  const f = fixture();
  const { first, second } = await twoVersions(f);
  const once = await f.service.rollbackBuyerCatalog('cmd:rollback', 'owner:1', first.id, { expectedLatestBuyerCatalogVersionId: second.id });
  const replay = await f.service.rollbackBuyerCatalog('cmd:rollback', 'owner:1', first.id, { expectedLatestBuyerCatalogVersionId: second.id });
  assert.deepEqual(replay, once);
  assert.equal(f.state().catalogs.length, 3);

  const third = await f.service.publishBuyerCatalog('cmd:c', 'owner:1', 'publication:1', { showroomId: 'showroom:1', shopId: 'shop:1', priceOverrides: [{ productSkuId: 'psku:1', wholesalePriceMinor: 50000 }] });
  const again = await f.service.rollbackBuyerCatalog('cmd:rollback-2', 'owner:1', first.id, { expectedLatestBuyerCatalogVersionId: third.buyerCatalogVersion.id });
  assert.equal(again.buyerCatalogVersion.lines[0].wholesalePriceMinor, 95000);
  assert.notEqual(again.buyerCatalogVersion.contentHash, once.buyerCatalogVersion.contentHash);
});

test('rollback refuses a stale view, the current version, an identical content and a foreign role', async () => {
  const f = fixture();
  const { first, second } = await twoVersions(f);
  await assert.rejects(
    f.service.rollbackBuyerCatalog('cmd:stale', 'owner:1', first.id, { expectedLatestBuyerCatalogVersionId: first.id }),
    (error) => error?.code === 'BUYER_CATALOG_ROLLBACK_STALE',
  );
  await assert.rejects(
    f.service.rollbackBuyerCatalog('cmd:current', 'owner:1', second.id, { expectedLatestBuyerCatalogVersionId: second.id }),
    (error) => error?.code === 'BUYER_CATALOG_ROLLBACK_TARGET_CURRENT',
  );
  await assert.rejects(
    f.service.rollbackBuyerCatalog('cmd:missing', 'owner:1', second.id, {}),
    (error) => error?.code === 'BUYER_CATALOG_ROLLBACK_EXPECTED_LATEST_REQUIRED',
  );
  f.context.membership = { ...f.context.membership, role: 'viewer' };
  await assert.rejects(
    f.service.rollbackBuyerCatalog('cmd:viewer', 'owner:1', first.id, { expectedLatestBuyerCatalogVersionId: second.id }),
    (error) => error?.code === 'CAPABILITY_DENIED',
  );
  assert.equal(f.state().catalogs.length, 2, 'refusals leave no partial writes');
});

test('the brand can read the version history it rolls back through, newest first, as summaries', async () => {
  const f = fixture();
  const { first, second } = await twoVersions(f);
  const history = await f.service.listBuyerCatalogVersionsForAccessForActor('owner:1', 'showroom:1', 'shop:1');
  assert.deepEqual(history.items.map((item) => item.id), [second.id, first.id]);
  assert.equal(history.items[0].lineCount, 1);
  assert.equal('lines' in history.items[0], false, 'a summary, not the content');
  await assert.rejects(f.service.listBuyerCatalogVersionsForAccessForActor('stranger:1', 'showroom:1', 'shop:1'), (error) => error?.code === 'ACTIVE_MEMBERSHIP_REQUIRED');
});

test('the rollback and history routes exist, validate their bodies and are documented in OpenAPI', async () => {
  const calls = [];
  const routes = createCommercialPublicationRoutes({
    commercialPublication: {
      rollbackBuyerCatalog: (...args) => { calls.push(['rollback', ...args]); return {}; },
      listBuyerCatalogVersionsForAccessForActor: (...args) => { calls.push(['history', ...args]); return {}; },
    },
  });
  const rollback = routes.find((route) => route.method === 'POST' && route.pattern.test('/v2/buyer-catalog-versions/v1/rollback'));
  assert.ok(rollback, 'rollback route');
  assert.equal(rollback.mutation, true);
  await rollback.execute({ commandId: 'c', actorId: 'a', params: ['v1'], body: { expectedLatestBuyerCatalogVersionId: 'v2' }, query: {} });
  assert.deepEqual(calls[0], ['rollback', 'c', 'a', 'v1', { expectedLatestBuyerCatalogVersionId: 'v2' }]);
  assert.throws(() => rollback.execute({ commandId: 'c', actorId: 'a', params: ['v1'], body: { price: 1 }, query: {} }), (error) => error?.code === 'HTTP_BODY_FIELD_UNKNOWN');
  assert.throws(() => rollback.execute({ commandId: 'c', actorId: 'a', params: ['v1'], body: {}, query: {} }), (error) => error?.code === 'HTTP_BODY_FIELD_INVALID');
  const history = routes.find((route) => route.method === 'GET' && route.pattern.test('/v2/showrooms/s1/buyer-catalog-versions'));
  assert.ok(history, 'history route');
  assert.ok(wholesaleV2OpenApi.paths['/buyer-catalog-versions/{buyerCatalogVersionId}/rollback']?.post);
  assert.ok(wholesaleV2OpenApi.paths['/showrooms/{showroomId}/buyer-catalog-versions']?.get);
});
