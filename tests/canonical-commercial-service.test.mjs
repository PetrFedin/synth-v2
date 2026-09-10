import assert from 'node:assert/strict';
import test from 'node:test';
import { createCommercialPublicationService } from '../src/application/commercial-publication-service.mjs';
import { createProjectionBackedCommercialPublication } from '../src/modules/commercial-publication/public.mjs';
import { collection, projection, publishedAt } from './fixtures/commercial-publication-v2.mjs';

function fixture() {
  let state = { commands: new Map(), prices: [], catalogs: [], events: [] };
  const publication = createProjectionBackedCommercialPublication({ id: 'publication:1', collection, commercialProjection: projection(), publishedAt });
  const context = {
    publication,
    membership: { status: 'active', role: 'owner', organisationId: 'brand:1', userId: 'owner:1' },
    showroom: { id: 'showroom:1', brandId: 'brand:1', collectionId: 'collection:1', status: 'open' },
    invitation: {
      id: 'invite:1', showroomId: 'showroom:1', brandId: 'brand:1', shopId: 'shop:1',
      status: 'accepted', expiresAt: '2099-12-31T00:00:00.000Z',
    },
  };

  const commercialStore = {
    async getCommercialPublication() { return context.publication; },
    async transaction(work) {
      const draft = structuredClone(state);
      const result = await work({
        async getCommand(id) { return draft.commands.get(id); },
        async insertCommand(row) { draft.commands.set(row.id, row); },
        async insertPriceListVersion(row) { draft.prices.push(row); },
        async insertBuyerCatalogVersion(row) { draft.catalogs.push(row); },
        async appendOutbox(row) { draft.events.push(row); },
      });
      state = draft;
      return result;
    },
  };
  const wholesaleStore = {
    async transaction(work) {
      return work({
        async getShowroom() { return context.showroom; },
        async getMembership(organisationId, actorId) {
          return organisationId === 'brand:1' && actorId === 'owner:1' ? context.membership : undefined;
        },
        async getShowroomInvitationByAccess() { return context.invitation; },
      });
    },
  };
  let sequence = 0;
  const service = createCommercialPublicationService({
    commercialStore,
    wholesaleStore,
    clock: () => publishedAt,
    nextId: (prefix) => `${prefix}:${++sequence}`,
  });
  const input = {
    showroomId: 'showroom:1',
    shopId: 'shop:1',
    priceOverrides: [{ productSkuId: 'psku:1', wholesalePriceMinor: 95000 }],
  };
  return { context, input, service, state: () => state };
}

test('canonical buyer publication creates one exact price/catalog pair and exact replay creates no duplicate facts', async () => {
  const f = fixture();
  const result = await f.service.publishBuyerCatalog('cmd:1', 'owner:1', 'publication:1', f.input);
  const replay = await f.service.publishBuyerCatalog('cmd:1', 'owner:1', 'publication:1', structuredClone(f.input));

  assert.deepEqual(replay, result);
  assert.equal(f.state().prices.length, 1);
  assert.equal(f.state().catalogs.length, 1);
  assert.equal(f.state().events.length, 2);
  assert.equal(f.state().commands.size, 1);
  assert.equal(result.priceListVersion.lines[0].productSkuId, 'psku:1');
  assert.equal(result.priceListVersion.lines[0].wholesalePriceMinor, 95000);
  assert.equal(result.buyerCatalogVersion.priceListVersionId, result.priceListVersion.id);

  await assert.rejects(
    f.service.publishBuyerCatalog('cmd:1', 'owner:1', 'publication:1', { ...f.input, priceOverrides: [] }),
    (error) => error?.code === 'COMMAND_ID_CONFLICT',
  );
  assert.equal(f.state().prices.length, 1);
  assert.equal(f.state().catalogs.length, 1);
});

test('V1 commercial history cannot create fresh buyer truth and leaves no partial writes', async () => {
  const f = fixture();
  f.context.publication = {
    id: 'publication:1', status: 'published', brandId: 'brand:1', collectionId: 'collection:1', currency: 'RUB',
    lines: [{ sku: 'SKU-1', catalogVersion: 1, unitPrice: 1000, currency: 'RUB', minimumOrderQuantity: 1 }],
  };
  await assert.rejects(
    f.service.publishBuyerCatalog('cmd:1', 'owner:1', 'publication:1', { ...f.input, priceOverrides: [] }),
    (error) => error?.code === 'PRICE_LIST_CANONICAL_PUBLICATION_REQUIRED',
  );
  assert.deepEqual([f.state().prices.length, f.state().catalogs.length, f.state().events.length, f.state().commands.size], [0, 0, 0, 0]);
});

test('role, organisation and current invitation authorization remain mandatory, including replay', async () => {
  const f = fixture();
  await assert.rejects(
    f.service.publishBuyerCatalog('cmd:1', 'shop-owner:1', 'publication:1', f.input),
    (error) => error?.code === 'ACTIVE_MEMBERSHIP_REQUIRED',
  );

  f.context.membership = { ...f.context.membership, role: 'viewer' };
  await assert.rejects(
    f.service.publishBuyerCatalog('cmd:1', 'owner:1', 'publication:1', f.input),
    (error) => error?.code === 'CAPABILITY_DENIED',
  );

  f.context.membership = { ...f.context.membership, role: 'owner' };
  await assert.rejects(
    f.service.publishBuyerCatalog('cmd:1', 'owner:1', 'publication:1', { ...f.input, shopId: 'shop:other' }),
    (error) => error?.code === 'SHOWROOM_INVITATION_TRADE_MISMATCH',
  );

  await f.service.publishBuyerCatalog('cmd:1', 'owner:1', 'publication:1', f.input);
  f.context.invitation = { ...f.context.invitation, status: 'revoked' };
  await assert.rejects(
    f.service.publishBuyerCatalog('cmd:1', 'owner:1', 'publication:1', f.input),
    (error) => error?.code === 'SHOWROOM_ACCESS_REQUIRED',
  );
  assert.equal(f.state().catalogs.length, 1);
});

test('unknown application fields and malformed pricing fail before persistence', async () => {
  const f = fixture();
  for (const input of [
    { ...f.input, currency: 'USD' },
    { ...f.input, priceOverrides: null },
    { ...f.input, priceOverrides: [{ sku: 'SKU-1', unitPrice: 1 }] },
  ]) {
    await assert.rejects(f.service.publishBuyerCatalog('cmd:1', 'owner:1', 'publication:1', input));
    assert.deepEqual([f.state().prices.length, f.state().catalogs.length, f.state().events.length, f.state().commands.size], [0, 0, 0, 0]);
  }
});
