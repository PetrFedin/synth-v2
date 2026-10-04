import assert from 'node:assert/strict';
import test from 'node:test';
import { createCommercialPublicationService } from '../src/application/commercial-publication-service.mjs';
import { createProjectionBackedCommercialPublication } from '../src/modules/commercial-publication/public.mjs';
import { collection, projection, publishedAt } from './fixtures/commercial-publication-v2.mjs';

// Приёмочный прогон оптовой цепочки, дефект B: каталог байера для того же магазина в ДРУГОМ шоуруме без
// цен на магазин падал с 409 PRICE_LIST_VERSION_ALREADY_EXISTS. Прайс-лист — это снимок + магазин +
// цены на магазин; шоурума в нём нет, поэтому содержимое (и `content_hash`) у второго каталога то же,
// а версия неизменяема. Теперь она переиспользуется; другие цены — по-прежнему новая версия.

function fixture() {
  let state = { commands: new Map(), prices: [], catalogs: [], events: [] };
  let tick = 0;
  const publication = createProjectionBackedCommercialPublication({ id: 'publication:1', collection, commercialProjection: projection(), publishedAt });
  const showrooms = new Map(['showroom:1', 'showroom:2'].map((id) => [id, { id, brandId: 'brand:1', collectionId: 'collection:1', status: 'open' }]));
  const invitations = new Map([...showrooms.keys()].map((id) => [id, { id: `invite:${id}`, showroomId: id, brandId: 'brand:1', shopId: 'shop:1', status: 'accepted', expiresAt: '2099-12-31T00:00:00.000Z' }]));
  const membership = { status: 'active', role: 'owner', organisationId: 'brand:1', userId: 'owner:1' };
  const commercialStore = {
    async getCommercialPublication() { return publication; },
    async transaction(work) {
      const draft = structuredClone(state);
      draft.commands = new Map(state.commands);
      const result = await work({
        async getCommand(id) { return draft.commands.get(id); },
        async insertCommand(row) { draft.commands.set(row.id, row); },
        async getPriceListVersionByContentHash(hash) { return structuredClone(draft.prices.find((price) => price.contentHash === hash)); },
        async insertPriceListVersion(row) {
          assert.equal(draft.prices.some((price) => price.contentHash === row.contentHash), false, 'content_hash is unique in price_list_versions');
          draft.prices.push(row);
        },
        async insertBuyerCatalogVersion(row) {
          assert.equal(draft.catalogs.some((catalog) => catalog.contentHash === row.contentHash), false, 'content_hash is unique in buyer_catalog_versions');
          draft.catalogs.push(row);
        },
        async appendOutbox(row) { draft.events.push(row); },
      });
      state = draft;
      return result;
    },
  };
  const wholesaleStore = {
    async transaction(work) {
      return work({
        async getShowroom(id) { return showrooms.get(id); },
        async getMembership(organisationId, actorId) { return organisationId === 'brand:1' && actorId === membership.userId ? membership : undefined; },
        async getRelationshipByTrade(brandId, shopId) { return Object.freeze({ id: 'relationship:1', brandId, shopId, status: 'active' }); },
        async getShowroomInvitationByAccess(showroomId) { return invitations.get(showroomId); },
      });
    },
  };
  let sequence = 0;
  const service = createCommercialPublicationService({
    commercialStore, wholesaleStore,
    clock: () => new Date(Date.parse(publishedAt) + (++tick) * 60_000).toISOString(),
    nextId: (prefix) => `${prefix}:${++sequence}`,
  });
  return { service, state: () => state };
}

test('the same shop in a second showroom without price overrides reuses the identical price list version', async () => {
  const f = fixture();
  const first = await f.service.publishBuyerCatalog('cmd:1', 'owner:1', 'publication:1', { showroomId: 'showroom:1', shopId: 'shop:1' });
  const second = await f.service.publishBuyerCatalog('cmd:2', 'owner:1', 'publication:1', { showroomId: 'showroom:2', shopId: 'shop:1' });
  assert.equal(second.priceListVersion.id, first.priceListVersion.id, 'the immutable price list is reused, not duplicated');
  assert.equal(second.buyerCatalogVersion.priceListVersionId, first.priceListVersion.id);
  assert.notEqual(second.buyerCatalogVersion.id, first.buyerCatalogVersion.id);
  assert.equal(second.buyerCatalogVersion.showroomId, 'showroom:2');
  assert.equal(f.state().prices.length, 1);
  assert.equal(f.state().catalogs.length, 2);
  assert.equal(f.state().events.filter((event) => event.type === 'price-list-version.published').length, 1, 'no second publication event for a reused version');
  assert.equal(f.state().events.filter((event) => event.type === 'buyer-catalog-version.published').length, 2);
});

test('different price overrides are different content and still create a new price list version', async () => {
  const f = fixture();
  const first = await f.service.publishBuyerCatalog('cmd:1', 'owner:1', 'publication:1', { showroomId: 'showroom:1', shopId: 'shop:1' });
  const second = await f.service.publishBuyerCatalog('cmd:2', 'owner:1', 'publication:1', { showroomId: 'showroom:2', shopId: 'shop:1', priceOverrides: [{ productSkuId: 'psku:1', wholesalePriceMinor: 95000 }] });
  assert.notEqual(second.priceListVersion.id, first.priceListVersion.id);
  assert.equal(f.state().prices.length, 2);
});

test('publishing the very same catalogue to the same showroom twice stays a conflict: nothing new to publish', async () => {
  const f = fixture();
  await f.service.publishBuyerCatalog('cmd:1', 'owner:1', 'publication:1', { showroomId: 'showroom:1', shopId: 'shop:1' });
  await assert.rejects(
    f.service.publishBuyerCatalog('cmd:2', 'owner:1', 'publication:1', { showroomId: 'showroom:1', shopId: 'shop:1' }),
    (error) => error.code === 'BUYER_CATALOG_VERSION_ALREADY_EXISTS' || /assert|unique/i.test(error.message),
  );
});
