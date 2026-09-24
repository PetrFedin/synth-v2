import test from 'node:test';
import assert from 'node:assert/strict';

import { createCommercialPublicationService } from '../src/application/commercial-publication-service.mjs';

// Публикация коммерческого снимка требует `commercialProjectionId`, и до этого чтения его знал
// только скрипт: ассортимент коллекции на чтение не отдавался вовсе, поэтому форма в браузере
// собрать список выбора не могла. Правило «проекция опубликована и её версия модели назначена в
// коллекцию» принадлежит домену — здесь проверяется, что наружу уходит ровно то, что публикация
// примет, и ничего больше.

function projection(id, styleVersionId, status, styleCode) {
  return {
    id,
    styleVersionId,
    brandId: 'brand-1',
    versionNo: 2,
    status,
    payload: {
      developmentRoute: 'READY_GOODS',
      technicalSnapshot: {
        product: {
          style: { styleCode },
          styleVersion: { titleRu: 'Стёганая куртка', titleEn: 'Quilted jacket', versionNo: 2 },
        },
      },
    },
  };
}

function serviceWith({ role = 'owner', assignments, projectionsByStyleVersion } = {}) {
  return createCommercialPublicationService({
    commercialStore: { transaction: async work => work({}) },
    wholesaleStore: {
      transaction: async work => work({
        getCollection: async id => ({ id, brandId: 'brand-1', status: 'published' }),
        getMembership: async () => (role ? { organisationId: 'brand-1', status: 'active', role } : null),
        listCollectionStyleVersions: async () => assignments,
      }),
    },
    catalogReader: { getSku: async () => null },
    projectionListReader: {
      listCommercialProjectionsByStyleVersion: async styleVersionId => projectionsByStyleVersion[styleVersionId] ?? [],
    },
  });
}

test('a collection offers only published projections of the style versions assigned to it', async () => {
  const service = serviceWith({
    assignments: [{ styleVersionId: 'style-version-1' }, { styleVersionId: 'style-version-2' }],
    projectionsByStyleVersion: {
      'style-version-1': [
        projection('projection-draft', 'style-version-1', 'draft', 'SYN.JKT'),
        projection('projection-published', 'style-version-1', 'published', 'SYN.JKT'),
      ],
      'style-version-2': [projection('projection-tee', 'style-version-2', 'published', 'SYN.TEE')],
      // Назначения нет — значит и в списке быть не должно, даже если проекция опубликована.
      'style-version-3': [projection('projection-elsewhere', 'style-version-3', 'published', 'SYN.CAP')],
    },
  });

  const answer = await service.listPublishableProjectionsForCollection('actor-1', 'collection-1');
  assert.deepEqual(answer.items.map(item => item.id), ['projection-published', 'projection-tee']);
  assert.equal(answer.collectionStatus, 'published');
});

test('the picker row carries what a person chooses by and not the whole technical snapshot', async () => {
  const service = serviceWith({
    assignments: [{ styleVersionId: 'style-version-1' }],
    projectionsByStyleVersion: { 'style-version-1': [projection('projection-1', 'style-version-1', 'published', 'SYN.JKT')] },
  });

  const [row] = (await service.listPublishableProjectionsForCollection('actor-1', 'collection-1')).items;
  assert.deepEqual(Object.keys(row).sort(), [
    'developmentRoute', 'id', 'status', 'styleCode', 'styleVersionId', 'titleEn', 'titleRu', 'versionNo',
  ]);
  assert.equal(row.styleCode, 'SYN.JKT');
  assert.equal(row.titleRu, 'Стёганая куртка');
  assert.equal(row.versionNo, 2);
  assert.equal(row.payload, undefined);
});

test('a projection from another brand never reaches the picker', async () => {
  const foreign = { ...projection('projection-foreign', 'style-version-1', 'published', 'SYN.JKT'), brandId: 'brand-2' };
  const service = serviceWith({
    assignments: [{ styleVersionId: 'style-version-1' }],
    projectionsByStyleVersion: { 'style-version-1': [foreign] },
  });

  assert.deepEqual((await service.listPublishableProjectionsForCollection('actor-1', 'collection-1')).items, []);
});

// Список, который видно, но из которого нельзя выбрать, хуже пустого: спрашивается та же
// способность, что и у самой публикации.
test('the picker asks for the capability that publication itself asks for', async () => {
  const viewer = serviceWith({
    role: 'viewer',
    assignments: [{ styleVersionId: 'style-version-1' }],
    projectionsByStyleVersion: { 'style-version-1': [projection('projection-1', 'style-version-1', 'published', 'SYN.JKT')] },
  });

  await assert.rejects(
    () => viewer.listPublishableProjectionsForCollection('actor-1', 'collection-1'),
    error => error?.code === 'CAPABILITY_DENIED',
  );

  const stranger = serviceWith({
    role: null,
    assignments: [{ styleVersionId: 'style-version-1' }],
    projectionsByStyleVersion: {},
  });
  await assert.rejects(
    () => stranger.listPublishableProjectionsForCollection('actor-1', 'collection-1'),
    error => typeof error?.code === 'string' && error.code !== 'TypeError',
  );
});

test('a collection with no assigned style versions offers nothing rather than failing', async () => {
  const service = serviceWith({ assignments: [], projectionsByStyleVersion: {} });
  const answer = await service.listPublishableProjectionsForCollection('actor-1', 'collection-1');
  assert.deepEqual(answer.items, []);
});
