import test from 'node:test';
import assert from 'node:assert/strict';

import {
  decodeCommercialPublicationCursor,
  encodeCommercialPublicationCursor,
} from '../src/core/commercial-publication-cursor.mjs';
import { createCommercialPublicationService } from '../src/application/commercial-publication-service.mjs';
import { createCommercialPublicationRoutes } from '../src/http/commercial-publication-routes.mjs';
import { createPostgresCommercialPublicationStore } from '../src/infrastructure/postgres-commercial-publication-store.mjs';

test('commercial publication cursor is deterministic and validates malformed cursors', () => {
  const value = { publishedAt: '2026-08-10T08:30:00.000Z', id: 'publication-2' };
  const cursor = encodeCommercialPublicationCursor(value);
  assert.equal(cursor, encodeCommercialPublicationCursor(value));
  assert.deepEqual(decodeCommercialPublicationCursor(cursor), value);
  assert.throws(
    () => decodeCommercialPublicationCursor('not-a-json-cursor'),
    error => error?.code === 'COMMERCIAL_PUBLICATION_CURSOR_INVALID',
  );
});

test('commercial publication service lists a bounded actor-authorized collection page', async () => {
  const rows = [
    publication('publication-3', '2026-08-10T10:00:00.000Z'),
    publication('publication-2', '2026-08-10T09:00:00.000Z'),
  ];
  const calls = [];
  const service = createCommercialPublicationService({
    commercialStore: {
      transaction: async work => work({}),
      listCommercialPublicationsByCollection: async (collectionId, options) => {
        calls.push({ collectionId, options });
        return rows;
      },
    },
    wholesaleStore: {
      transaction: async work => work({
        getCollection: async id => ({ id, brandId: 'brand-1' }),
        getMembership: async () => ({ organisationId: 'brand-1', status: 'active', role: 'viewer' }),
      }),
    },
    catalogReader: { getSku: async () => null },
  });

  const page = await service.listCommercialPublicationsForActor('actor-1', 'collection-1', { limit: 1 });
  assert.deepEqual(page.items, [rows[0]]);
  assert.deepEqual(decodeCommercialPublicationCursor(page.nextCursor), {
    publishedAt: rows[0].publishedAt,
    id: rows[0].id,
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].collectionId, 'collection-1');
  assert.equal(calls[0].options.limit, 1);
  assert.equal(calls[0].options.cursor, null);
});

test('commercial publication service rejects actors without active collection membership', async () => {
  const service = createCommercialPublicationService({
    commercialStore: {
      transaction: async work => work({}),
      listCommercialPublicationsByCollection: async () => [],
    },
    wholesaleStore: {
      transaction: async work => work({
        getCollection: async id => ({ id, brandId: 'brand-1' }),
        getMembership: async () => null,
      }),
    },
    catalogReader: { getSku: async () => null },
  });

  await assert.rejects(
    service.listCommercialPublicationsForActor('actor-2', 'collection-1'),
    error => error?.code === 'ACTIVE_MEMBERSHIP_REQUIRED',
  );
});

test('commercial publication service discovers latest buyer catalog through actor-authorized showroom access', async () => {
  const catalog = buyerCatalog();
  const accessLookups = [];
  const service = createCommercialPublicationService({
    commercialStore: {
      transaction: async work => work({}),
      getBuyerCatalogForAccess: async (showroomId, shopId) => {
        accessLookups.push({ showroomId, shopId });
        return catalog;
      },
    },
    wholesaleStore: {
      transaction: async work => work({
        getMembership: async organisationId => organisationId === 'shop-1'
          ? { organisationId: 'shop-1', status: 'active', role: 'buyer' }
          : null,
        getShowroomInvitation: async invitationId => invitationId === 'invitation-1'
          ? {
              id: 'invitation-1',
              showroomId: 'showroom-1',
              brandId: 'brand-1',
              shopId: 'shop-1',
              status: 'accepted',
              expiresAt: '2026-09-01T00:00:00.000Z',
            }
          : null,
      }),
    },
    catalogReader: { getSku: async () => null },
    clock: () => '2026-08-11T00:00:00.000Z',
  });

  const result = await service.getBuyerCatalogForAccessForActor('actor-1', 'showroom-1', 'shop-1');
  assert.equal(result, catalog);
  assert.deepEqual(accessLookups, [{ showroomId: 'showroom-1', shopId: 'shop-1' }]);
});

test('commercial publication service does not expose discovered buyer catalog without actor access', async () => {
  const service = createCommercialPublicationService({
    commercialStore: {
      transaction: async work => work({}),
      getBuyerCatalogForAccess: async () => buyerCatalog(),
    },
    wholesaleStore: {
      transaction: async work => work({
        getMembership: async () => null,
        getShowroomInvitation: async () => null,
      }),
    },
    catalogReader: { getSku: async () => null },
  });

  await assert.rejects(
    service.getBuyerCatalogForAccessForActor('actor-2', 'showroom-1', 'shop-1'),
    error => error?.code === 'ACTIVE_MEMBERSHIP_REQUIRED',
  );
});

test('postgres commercial publication query uses stable tuple pagination and limit plus one', async () => {
  const calls = [];
  const pool = {
    connect() { throw new Error('transaction should not be used by read query'); },
    async query(sql, values) {
      calls.push({ sql, values });
      return { rows: [{ payload: publication('publication-1', '2026-08-10T08:00:00.000Z') }] };
    },
  };
  const store = createPostgresCommercialPublicationStore({ pool });
  const cursor = { publishedAt: '2026-08-10T09:00:00.000Z', id: 'publication-2' };
  const rows = await store.listCommercialPublicationsByCollection('collection-1', { limit: 25, cursor });

  assert.equal(rows.length, 1);
  assert.match(calls[0].sql, /published_at < \$2::timestamptz/);
  assert.match(calls[0].sql, /published_at = \$2::timestamptz AND id < \$3/);
  assert.match(calls[0].sql, /ORDER BY published_at DESC, id DESC/);
  assert.deepEqual(calls[0].values, ['collection-1', cursor.publishedAt, cursor.id, 26]);
});

test('commercial publication HTTP route parses bounded collection pagination', async () => {
  const received = [];
  const routes = createCommercialPublicationRoutes({
    commercialPublication: {
      listCommercialPublicationsForActor: async (...args) => { received.push(args); return { items: [], nextCursor: null }; },
      publishCommercialPublication: async () => {},
      publishBuyerCatalog: async () => {},
      getCommercialPublicationForActor: async () => {},
      getBuyerCatalogVersionForActor: async () => {},
      getBuyerCatalogForAccessForActor: async () => {},
    },
  });
  const route = routes.find(candidate => candidate.method === 'GET' && candidate.pattern.test('/v2/collections/collection-1/commercial-publications'));
  assert.ok(route);
  const match = '/v2/collections/collection-1/commercial-publications'.match(route.pattern);
  await route.execute({ actorId: 'actor-1', params: match.slice(1), query: { limit: '25' } });
  assert.deepEqual(received[0], ['actor-1', 'collection-1', { limit: 25, cursor: null }]);
  assert.throws(
    () => route.execute({ actorId: 'actor-1', params: match.slice(1), query: { limit: '201' } }),
    error => error?.code === 'HTTP_QUERY_FIELD_INVALID',
  );
});

test('commercial publication HTTP resolves buyer catalog by showroom and required shop context', async () => {
  const received = [];
  const routes = createCommercialPublicationRoutes({
    commercialPublication: {
      listCommercialPublicationsForActor: async () => ({ items: [], nextCursor: null }),
      publishCommercialPublication: async () => {},
      publishBuyerCatalog: async () => {},
      getCommercialPublicationForActor: async () => {},
      getBuyerCatalogVersionForActor: async () => {},
      getBuyerCatalogForAccessForActor: async (...args) => {
        received.push(args);
        return { id: 'buyer-catalog-version-1' };
      },
    },
  });
  const pathname = '/v2/showrooms/showroom-1/buyer-catalog';
  const route = routes.find(candidate => candidate.method === 'GET' && candidate.pattern.test(pathname));
  assert.ok(route);
  const match = pathname.match(route.pattern);

  const result = await route.execute({ actorId: 'actor-1', params: match.slice(1), query: { shopId: 'shop-1' } });
  assert.equal(result.id, 'buyer-catalog-version-1');
  assert.deepEqual(received, [['actor-1', 'showroom-1', 'shop-1']]);
  assert.throws(
    () => route.execute({ actorId: 'actor-1', params: match.slice(1), query: {} }),
    error => error?.code === 'HTTP_QUERY_FIELD_INVALID',
  );
  assert.throws(
    () => route.execute({ actorId: 'actor-1', params: match.slice(1), query: { shopId: 'shop-1', surprise: '1' } }),
    error => error?.code === 'HTTP_QUERY_FIELD_UNKNOWN',
  );
  assert.throws(
    () => route.execute({ actorId: 'actor-1', params: match.slice(1), query: { shopId: 'bad id' } }),
    error => error?.code === 'HTTP_QUERY_FIELD_INVALID',
  );
});

function publication(id, publishedAt) {
  return Object.freeze({
    id,
    brandId: 'brand-1',
    collectionId: 'collection-1',
    currency: 'EUR',
    lines: Object.freeze([{ sku: 'SKU-1', name: 'Look 1', catalogVersion: 1, unitPrice: 100, currency: 'EUR', minimumOrderQuantity: 1 }]),
    status: 'published',
    contentHash: 'a'.repeat(64),
    publishedAt,
  });
}

function buyerCatalog() {
  return Object.freeze({
    id: 'buyer-catalog-version-1',
    publicationId: 'publication-1',
    priceListVersionId: 'price-list-version-1',
    brandId: 'brand-1',
    shopId: 'shop-1',
    showroomId: 'showroom-1',
    accessGrantId: 'invitation-1',
    collectionId: 'collection-1',
    currency: 'EUR',
    lines: Object.freeze([
      Object.freeze({
        sku: 'SKU-1',
        catalogVersion: 1,
        unitPrice: 100,
        currency: 'EUR',
        minimumOrderQuantity: 1,
      }),
    ]),
    status: 'published',
    contentHash: 'b'.repeat(64),
    publishedAt: '2026-08-10T10:00:00.000Z',
  });
}