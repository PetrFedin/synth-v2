import test from 'node:test';
import assert from 'node:assert/strict';
import { createCommercialPublicationService } from '../src/application/commercial-publication-service.mjs';

function fixture({ assigned = false } = {}) {
  const collection = Object.freeze({
    id: 'collection-1',
    campaignId: 'campaign-1',
    brandId: 'brand-1',
    name: 'Runway',
    currency: 'EUR',
    status: 'published',
    version: 2,
  });
  const membership = Object.freeze({
    id: 'membership-1',
    organisationId: 'brand-1',
    organisationType: 'brand',
    userId: 'brand-owner',
    role: 'owner',
    status: 'active',
  });
  const assignment = Object.freeze({
    id: 'collection-style-version-1',
    collectionId: collection.id,
    brandId: collection.brandId,
    styleVersionId: 'style-version-1',
    assignedAt: '2026-08-26T14:00:00.000Z',
    assignedBy: 'brand-owner',
  });
  const projection = Object.freeze({
    id: 'projection-1',
    status: 'published',
    brandId: 'brand-1',
    styleVersionId: 'style-version-1',
    versionNo: 1,
    contentHash: 'projection-hash-1',
    readinessSnapshotId: 'readiness-1',
    payload: Object.freeze({
      commercialPreparation: Object.freeze({
        brandId: 'brand-1',
        currency: 'EUR',
        titleRu: 'Платье',
        titleEn: 'Dress',
        descriptionRu: 'Кутюрное платье',
        descriptionEn: 'Couture dress',
        compositionRu: 'Шелк 100%',
        compositionEn: 'Silk 100%',
        countryOfOrigin: 'IT',
        mediaIds: Object.freeze([]),
        wholesalePriceMinor: 100000,
        rrpMinor: 250000,
        minimumOrderQuantity: 1,
        minimumOrderValueMinor: null,
        packRatio: null,
        deliveryStart: '2027-01-15',
        deliveryEnd: '2027-02-15',
        availability: Object.freeze({ status: 'available' }),
      }),
      technicalSnapshot: Object.freeze({
        product: Object.freeze({
          style: Object.freeze({ id: 'style-1', styleCode: 'ST-001' }),
          styleVersion: Object.freeze({ id: 'style-version-1', versionNo: 1, contentHash: 'style-hash-1' }),
          styleMedia: Object.freeze([]),
          styleAttributes: Object.freeze([]),
          colorways: Object.freeze([
            Object.freeze({
              id: 'colorway-1',
              colorwayCode: 'BLACK',
              nameRu: 'Черный',
              nameEn: 'Black',
              media: Object.freeze([]),
              attributes: Object.freeze([]),
              skus: Object.freeze([
                Object.freeze({
                  id: 'product-sku-1',
                  skuCode: 'ST-001-BLACK-42',
                  contentHash: 'sku-hash-1',
                  sizeValueId: 'size-42',
                  size: Object.freeze({ id: 'size-42', value: '42' }),
                  attributes: Object.freeze([]),
                }),
              ]),
            }),
          ]),
        }),
      }),
    }),
  });

  const commands = new Map();
  const publications = [];
  const events = [];
  const commercialStore = Object.freeze({
    transaction(work) {
      return work(Object.freeze({
        getCommand: (id) => commands.get(id) ?? null,
        insertCommand: (command) => { commands.set(command.id, command); return command; },
        insertCommercialPublication: (publication) => { publications.push(publication); return publication; },
        appendOutbox: (event) => { events.push(event); return event; },
      }));
    },
  });
  const wholesaleStore = Object.freeze({
    transaction(work) {
      return work(Object.freeze({
        getCollection: (id) => id === collection.id ? collection : null,
        getMembership: (organisationId, userId) => organisationId === 'brand-1' && userId === 'brand-owner' ? membership : null,
        getCollectionStyleVersion: (collectionId, styleVersionId) => assigned && collectionId === collection.id && styleVersionId === assignment.styleVersionId ? assignment : null,
      }));
    },
  });
  const commercialProjectionReader = Object.freeze({
    getCommercialProjection: (id) => id === projection.id ? projection : null,
  });
  let id = 0;
  const service = createCommercialPublicationService({
    commercialStore,
    wholesaleStore,
    commercialProjectionReader,
    clock: () => '2026-08-26T14:30:00.000Z',
    nextId: (prefix) => `${prefix}_${++id}`,
  });

  return Object.freeze({ service, publications, events, collection, projection });
}

test('commercial publication is blocked when its exact Style Version is absent from the collection', async () => {
  const context = fixture({ assigned: false });

  await assert.rejects(
    context.service.publishCommercialPublication('cmd-publication-missing-lineage', 'brand-owner', {
      collectionId: context.collection.id,
      commercialProjectionId: context.projection.id,
    }),
    (error) => error.code === 'COMMERCIAL_PUBLICATION_STYLE_VERSION_NOT_ASSIGNED',
  );

  assert.equal(context.publications.length, 0);
  assert.equal(context.events.length, 0);
});

test('commercial publication pins the assigned Style Version lineage', async () => {
  const context = fixture({ assigned: true });

  const publication = await context.service.publishCommercialPublication('cmd-publication-lineage-ok', 'brand-owner', {
    collectionId: context.collection.id,
    commercialProjectionId: context.projection.id,
  });

  assert.equal(publication.collectionId, context.collection.id);
  assert.equal(publication.commercialProjectionId, context.projection.id);
  assert.equal(publication.styleVersionId, context.projection.styleVersionId);
  assert.equal(publication.status, 'published');
  assert.equal(publication.lines.length, 1);
  assert.equal(publication.lines[0].productSkuId, 'product-sku-1');
  assert.equal(context.publications.length, 1);
  assert.equal(context.events.filter((event) => event.type === 'commercial-publication.published').length, 1);
});
