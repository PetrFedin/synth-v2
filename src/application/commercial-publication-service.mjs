import { domainEvent } from '../core/events.mjs';
import { invariant, requireEntity } from '../core/errors.mjs';
import { canonicalJson, fingerprintsMatch } from '../core/fingerprints.mjs';
import { decodeCommercialPublicationCursor, encodeCommercialPublicationCursor } from '../core/commercial-publication-cursor.mjs';
import { CAPABILITIES, assertCapability, roleHasCapability } from '../modules/access-control/public.mjs';
import { assertAcceptedShowroomAccess } from '../modules/showroom-invitations/public.mjs';
import {
  buyerCatalogContentEquals,
  createBuyerCatalogVersion,
  createPriceListVersion,
  createProjectionBackedCommercialPublication,
  restorePriceListVersion,
} from '../modules/commercial-publication/public.mjs';

export function createCommercialPublicationService({
  commercialStore,
  wholesaleStore,
  commercialProjectionReader = commercialStore,
  projectionListReader = commercialProjectionReader,
  changeImpactAdmission = null,
  clock = () => new Date().toISOString(),
  nextId = defaultIdGenerator(),
} = {}) {
  invariant(commercialStore && typeof commercialStore.transaction === 'function', 'COMMERCIAL_PUBLICATION_STORE_REQUIRED', 'Commercial publication store is required');
  invariant(wholesaleStore && typeof wholesaleStore.transaction === 'function', 'WHOLESALE_STORE_REQUIRED', 'Wholesale store is required');
  invariant(changeImpactAdmission === null || typeof changeImpactAdmission?.assertAdmitted === 'function', 'PRODUCT_ENGINEERING_CHANGE_ADMISSION_SERVICE_INVALID', 'Change-impact admission service is invalid');

  function execute(commandId, fingerprint, actorId, action) {
    invariant(commandId, 'COMMAND_ID_REQUIRED', 'Every mutation requires commandId');
    return commercialStore.transaction(async (tx) => {
      const previous = await tx.getCommand(commandId);
      if (previous) invariant(fingerprintsMatch(previous.fingerprint, fingerprint), 'COMMAND_ID_CONFLICT', 'commandId was already used by another mutation', { commandId });
      if (previous) return previous.result;
      const result = await action(tx);
      await tx.insertCommand(Object.freeze({ id: commandId, fingerprint, actorId, result, completedAt: clock() }));
      return result;
    });
  }

  async function append(tx, type, aggregateId, payload, commandId, actorId) {
    await tx.appendOutbox(domainEvent({ id: nextId('event'), type, aggregateId, occurredAt: clock(), payload, metadata: { commandId, actorId } }));
  }

  async function publicationContext(actorId, collectionId) {
    return wholesaleStore.transaction(async (tx) => {
      const collection = requireEntity(await tx.getCollection(collectionId), 'COLLECTION_NOT_FOUND', { collectionId });
      const membership = await tx.getMembership(collection.brandId, actorId);
      assertCapability(membership, CAPABILITIES.CATALOG_MANAGE);
      return collection;
    });
  }

  async function assertCollectionStyleVersionAssigned(collection, styleVersionId) {
    return wholesaleStore.transaction(async (tx) => {
      invariant(typeof tx.getCollectionStyleVersion === 'function', 'COLLECTION_STYLE_VERSION_READER_REQUIRED', 'Wholesale store must expose collection Style Version lineage');
      const assignment = await tx.getCollectionStyleVersion(collection.id, styleVersionId);
      invariant(assignment, 'COMMERCIAL_PUBLICATION_STYLE_VERSION_NOT_ASSIGNED', 'Commercial publication Style Version must be assigned to the collection', {
        collectionId: collection.id,
        styleVersionId,
      });
      invariant(assignment.brandId === collection.brandId, 'COMMERCIAL_PUBLICATION_STYLE_VERSION_BRAND_MISMATCH', 'Collection Style Version assignment brand is inconsistent', {
        collectionId: collection.id,
        styleVersionId,
      });
      return assignment;
    });
  }

  async function publicationReadContext(actorId, collectionId) {
    return wholesaleStore.transaction(async (tx) => {
      const collection = requireEntity(await tx.getCollection(collectionId), 'COLLECTION_NOT_FOUND', { collectionId });
      const membership = await tx.getMembership(collection.brandId, actorId);
      assertCapability(membership, CAPABILITIES.DEAL_READ);
      return collection;
    });
  }

  async function buyerCatalogContext(actorId, publication, showroomId, shopId) {
    return wholesaleStore.transaction(async (tx) => {
      const showroom = requireEntity(await tx.getShowroom(showroomId), 'SHOWROOM_NOT_FOUND', { showroomId });
      invariant(showroom.brandId === publication.brandId && showroom.collectionId === publication.collectionId, 'BUYER_CATALOG_SHOWROOM_MISMATCH', 'Showroom does not match commercial publication');
      const membership = await tx.getMembership(publication.brandId, actorId);
      assertCapability(membership, CAPABILITIES.SHOWROOM_MANAGE);
      const invitation = requireEntity(await tx.getShowroomInvitationByAccess(showroomId, shopId), 'SHOWROOM_INVITATION_NOT_FOUND', { showroomId, shopId });
      assertAcceptedShowroomAccess(invitation, { showroomId, brandId: publication.brandId, shopId, now: clock(), relationship: await tx.getRelationshipByTrade(publication.brandId, shopId) });
      return Object.freeze({ showroom, invitation });
    });
  }

  async function authorizePublicationRead(actorId, publication) {
    return wholesaleStore.transaction(async (tx) => {
      const membership = await tx.getMembership(publication.brandId, actorId);
      assertCapability(membership, CAPABILITIES.DEAL_READ);
      return publication;
    });
  }

  async function authorizeBuyerCatalogRead(actorId, buyerCatalog) {
    return wholesaleStore.transaction(async (tx) => {
      const brandMembership = await tx.getMembership(buyerCatalog.brandId, actorId);
      if (brandMembership?.status === 'active' && roleHasCapability(brandMembership.role, CAPABILITIES.DEAL_READ)) return buyerCatalog;
      const shopMembership = await tx.getMembership(buyerCatalog.shopId, actorId);
      assertCapability(shopMembership, CAPABILITIES.DEAL_READ);
      const invitation = requireEntity(await tx.getShowroomInvitation(buyerCatalog.accessGrantId), 'SHOWROOM_INVITATION_NOT_FOUND', { invitationId: buyerCatalog.accessGrantId });
      assertAcceptedShowroomAccess(invitation, { showroomId: buyerCatalog.showroomId, brandId: buyerCatalog.brandId, shopId: buyerCatalog.shopId, now: clock(), relationship: await tx.getRelationshipByTrade(buyerCatalog.brandId, buyerCatalog.shopId) });
      return buyerCatalog;
    });
  }

  return Object.freeze({
    async publishCommercialPublication(commandId, actorId, input) {
      invariant(input && typeof input.collectionId === 'string' && typeof input.commercialProjectionId === 'string', 'COMMERCIAL_PUBLICATION_INPUT_INVALID', 'collectionId and commercialProjectionId are required');
      invariant(commercialProjectionReader && typeof commercialProjectionReader.getCommercialProjection === 'function', 'COMMERCIAL_PROJECTION_READER_REQUIRED', 'Commercial Product Projection reader is required');
      const fingerprint = `publishCommercialPublication:${actorId}:${canonicalJson(input)}`;
      const collection = await publicationContext(actorId, input.collectionId);
      const projection = requireEntity(await commercialProjectionReader.getCommercialProjection(input.commercialProjectionId), 'COMMERCIAL_PROJECTION_NOT_FOUND', { commercialProjectionId: input.commercialProjectionId });
      invariant(projection.brandId === collection.brandId, 'COMMERCIAL_PUBLICATION_BRAND_MISMATCH', 'Commercial projection brand does not match collection brand');
      await assertCollectionStyleVersionAssigned(collection, projection.styleVersionId);
      return execute(commandId, fingerprint, actorId, async (tx) => {
        if (changeImpactAdmission) await changeImpactAdmission.assertAdmitted(projection.styleVersionId, 'commercial_publication');
        const publication = createProjectionBackedCommercialPublication({ id: nextId('commercial-publication'), collection, commercialProjection: projection, publishedAt: clock() });
        await tx.insertCommercialPublication(publication);
        await append(tx, 'commercial-publication.published', publication.id, {
          brandId: publication.brandId,
          collectionId: publication.collectionId,
          commercialProjectionId: publication.commercialProjectionId,
          styleVersionId: publication.styleVersionId,
          currency: publication.currency,
          lineCount: publication.lines.length,
          styleCount: publication.styles.length,
          contentHash: publication.contentHash,
        }, commandId, actorId);
        return publication;
      });
    },

    async publishBuyerCatalog(commandId, actorId, publicationId, input) {
      invariant(input && typeof input === 'object' && !Array.isArray(input), 'BUYER_CATALOG_PUBLICATION_INVALID', 'Buyer catalog publication request is invalid');
      invariant(Object.keys(input).every((key) => ['showroomId', 'shopId', 'priceOverrides'].includes(key)), 'BUYER_CATALOG_PUBLICATION_FIELD_UNKNOWN', 'Buyer catalog publication contains unsupported fields');
      const fingerprint = `publishBuyerCatalog:${actorId}:${publicationId}:${canonicalJson(input)}`;
      const publication = requireEntity(await commercialStore.getCommercialPublication(publicationId), 'COMMERCIAL_PUBLICATION_NOT_FOUND', { publicationId });
      const context = await buyerCatalogContext(actorId, publication, input.showroomId, input.shopId);
      return execute(commandId, fingerprint, actorId, async (tx) => {
        const publishedAt = clock();
        const candidate = createPriceListVersion({ id: nextId('price-list-version'), publication, shopId: input.shopId, priceOverrides: input.priceOverrides === undefined ? [] : input.priceOverrides, publishedAt });
        // Прайс-лист — чистая функция «снимок + магазин + цены на магазин»: он не знает про шоурум. Тот же
        // магазин в другом шоуруме с теми же ценами даёт буквально то же содержимое (и тот же
        // `content_hash`), а версия неизменяема и поэтому безопасно переиспользуется: новая запись
        // с тем же хешем столкнулась бы с оригиналом (PRICE_LIST_VERSION_ALREADY_EXISTS). Другие цены —
        // другое содержимое, и это уже новая версия.
        const existing = typeof tx.getPriceListVersionByContentHash === 'function' ? await tx.getPriceListVersionByContentHash(candidate.contentHash) : undefined;
        if (existing) invariant(existing.publicationId === publication.id && existing.shopId === input.shopId && existing.contentHash === candidate.contentHash, 'PRICE_LIST_VERSION_REUSE_MISMATCH', 'Existing price list version does not match the requested publication and shop', { priceListVersionId: existing.id });
        const priceListVersion = existing ?? candidate;
        const buyerCatalogVersion = createBuyerCatalogVersion({ id: nextId('buyer-catalog-version'), publication, priceListVersion, showroom: context.showroom, invitation: context.invitation, publishedAt });
        if (!existing) await tx.insertPriceListVersion(priceListVersion);
        await tx.insertBuyerCatalogVersion(buyerCatalogVersion);
        if (!existing) await append(tx, 'price-list-version.published', priceListVersion.id, { publicationId, brandId: publication.brandId, shopId: input.shopId, contentHash: priceListVersion.contentHash }, commandId, actorId);
        await append(tx, 'buyer-catalog-version.published', buyerCatalogVersion.id, { publicationId, priceListVersionId: priceListVersion.id, showroomId: input.showroomId, shopId: input.shopId, accessGrantId: context.invitation.id, contentHash: buyerCatalogVersion.contentHash }, commandId, actorId);
        return Object.freeze({ priceListVersion, buyerCatalogVersion });
      });
    },

    // Откат цены байера (O-05): выпускает новую версию каталога с содержимым прежней. Ничего не
    // удаляет и не правит — версии неизменяемы, на старую уже могли встать подборка и заказ. Ключ
    // `expectedLatestBuyerCatalogVersionId` — аналог expectedVersion: бренд откатывает то, что видел
    // последним, а не то, что успели опубликовать за это время.
    async rollbackBuyerCatalog(commandId, actorId, buyerCatalogVersionId, input) {
      invariant(input && typeof input === 'object' && !Array.isArray(input), 'BUYER_CATALOG_ROLLBACK_INVALID', 'Buyer catalog rollback request is invalid');
      invariant(Object.keys(input).every((key) => key === 'expectedLatestBuyerCatalogVersionId'), 'BUYER_CATALOG_ROLLBACK_FIELD_UNKNOWN', 'Buyer catalog rollback contains unsupported fields');
      invariant(typeof input.expectedLatestBuyerCatalogVersionId === 'string' && input.expectedLatestBuyerCatalogVersionId.length > 0, 'BUYER_CATALOG_ROLLBACK_EXPECTED_LATEST_REQUIRED', 'expectedLatestBuyerCatalogVersionId is required');
      const fingerprint = `rollbackBuyerCatalog:${actorId}:${buyerCatalogVersionId}:${input.expectedLatestBuyerCatalogVersionId}`;
      const target = requireEntity(await commercialStore.getBuyerCatalogVersion(buyerCatalogVersionId), 'BUYER_CATALOG_NOT_FOUND', { buyerCatalogVersionId });
      const publication = requireEntity(await commercialStore.getCommercialPublication(target.publicationId), 'COMMERCIAL_PUBLICATION_NOT_FOUND', { publicationId: target.publicationId });
      const context = await buyerCatalogContext(actorId, publication, target.showroomId, target.shopId);
      return execute(commandId, fingerprint, actorId, async (tx) => {
        const latest = requireEntity(
          await (typeof tx.getLatestBuyerCatalogForAccess === 'function' ? tx.getLatestBuyerCatalogForAccess(target.showroomId, target.shopId) : commercialStore.getBuyerCatalogForAccess(target.showroomId, target.shopId)),
          'BUYER_CATALOG_NOT_FOUND',
          { showroomId: target.showroomId, shopId: target.shopId },
        );
        invariant(latest.id === input.expectedLatestBuyerCatalogVersionId, 'BUYER_CATALOG_ROLLBACK_STALE', 'A newer buyer catalog was published since you looked; reload before rolling back', { expectedLatestBuyerCatalogVersionId: input.expectedLatestBuyerCatalogVersionId, latestBuyerCatalogVersionId: latest.id });
        invariant(latest.id !== target.id, 'BUYER_CATALOG_ROLLBACK_TARGET_CURRENT', 'This is already the current buyer catalog', { buyerCatalogVersionId: target.id });
        invariant(!buyerCatalogContentEquals(latest, target), 'BUYER_CATALOG_ROLLBACK_NO_CHANGE', 'The current buyer catalog already has this content', { buyerCatalogVersionId: target.id, latestBuyerCatalogVersionId: latest.id });
        const publishedAt = clock();
        const priceListVersion = restorePriceListVersion({ id: nextId('price-list-version'), publication, source: target, supersedes: latest, publishedAt });
        const buyerCatalogVersion = createBuyerCatalogVersion({
          id: nextId('buyer-catalog-version'),
          publication,
          priceListVersion,
          showroom: context.showroom,
          invitation: context.invitation,
          publishedAt,
          rollback: { restoredFromBuyerCatalogVersionId: target.id, supersedesBuyerCatalogVersionId: latest.id },
        });
        await tx.insertPriceListVersion(priceListVersion);
        await tx.insertBuyerCatalogVersion(buyerCatalogVersion);
        await append(tx, 'price-list-version.restored', priceListVersion.id, { publicationId: publication.id, brandId: publication.brandId, shopId: target.shopId, restoredFromBuyerCatalogVersionId: target.id, contentHash: priceListVersion.contentHash }, commandId, actorId);
        await append(tx, 'buyer-catalog-version.rolled-back', buyerCatalogVersion.id, { publicationId: publication.id, priceListVersionId: priceListVersion.id, showroomId: target.showroomId, shopId: target.shopId, restoredFromBuyerCatalogVersionId: target.id, supersedesBuyerCatalogVersionId: latest.id, contentHash: buyerCatalogVersion.contentHash }, commandId, actorId);
        return Object.freeze({ priceListVersion, buyerCatalogVersion });
      });
    },

    // История версий каталога байера для одного доступа, новые сверху: чтобы откатить цену, нужно
    // видеть, к чему откатывать. Версии отдаются сводкой (без строк) — это список выбора, а не
    // содержимое; читает бренд, который эти версии выпускает.
    async listBuyerCatalogVersionsForAccessForActor(actorId, showroomId, shopId, { limit = 50 } = {}) {
      invariant(Number.isInteger(limit) && limit > 0 && limit <= 200, 'BUYER_CATALOG_LIMIT_INVALID', 'Buyer catalog history limit must be between 1 and 200', { limit });
      invariant(typeof commercialStore.listBuyerCatalogVersionsForAccess === 'function', 'BUYER_CATALOG_HISTORY_QUERY_REQUIRED', 'Buyer catalog history query store is required');
      const showroom = await wholesaleStore.transaction(async (tx) => {
        const found = requireEntity(await tx.getShowroom(showroomId), 'SHOWROOM_NOT_FOUND', { showroomId });
        assertCapability(await tx.getMembership(found.brandId, actorId), CAPABILITIES.DEAL_READ);
        return found;
      });
      const versions = await commercialStore.listBuyerCatalogVersionsForAccess(showroomId, shopId, { limit });
      return Object.freeze({
        showroomId: showroom.id,
        shopId,
        items: Object.freeze(versions.map((version) => Object.freeze({
          id: version.id,
          publicationId: version.publicationId,
          priceListVersionId: version.priceListVersionId,
          lineCount: version.lines.length,
          contentHash: version.contentHash,
          publishedAt: version.publishedAt,
          restoredFromBuyerCatalogVersionId: version.restoredFromBuyerCatalogVersionId ?? null,
          supersedesBuyerCatalogVersionId: version.supersedesBuyerCatalogVersionId ?? null,
        }))),
      });
    },

    // Что эта коллекция может опубликовать.
    //
    // Публикация требует `commercialProjectionId`, и до сих пор его знал только скрипт: чтобы
    // собрать этот список в браузере, пришлось бы прочитать ассортимент коллекции (маршрута на
    // чтение не было вовсе), затем проекции каждой версии модели, затем отбросить
    // неопубликованные — три круга и правило домена, переписанное в интерфейсе. Правило
    // остаётся здесь, а наружу уходит ровно то, из чего человек выбирает.
    //
    // Спрашивает тот, кто будет публиковать, поэтому и спрашивается та же способность, что у
    // самой публикации: список, который видно, но из которого нельзя выбрать, — хуже пустого.
    async listPublishableProjectionsForCollection(actorId, collectionId, { limit = 50 } = {}) {
      invariant(Number.isInteger(limit) && limit > 0 && limit <= 200, 'COMMERCIAL_PUBLICATION_LIMIT_INVALID', 'Commercial publication page limit must be between 1 and 200', { limit });
      invariant(projectionListReader && typeof projectionListReader.listCommercialProjectionsByStyleVersion === 'function', 'COMMERCIAL_PROJECTION_LIST_READER_REQUIRED', 'Commercial Product Projection list reader is required');
      const collection = await publicationContext(actorId, collectionId);
      const assignments = await wholesaleStore.transaction(async (tx) => {
        invariant(typeof tx.listCollectionStyleVersions === 'function', 'COLLECTION_STYLE_VERSION_READER_REQUIRED', 'Wholesale store must expose collection Style Version lineage');
        return tx.listCollectionStyleVersions(collectionId);
      });
      const items = [];
      for (const assignment of assignments ?? []) {
        const projections = await projectionListReader.listCommercialProjectionsByStyleVersion(assignment.styleVersionId, { limit });
        for (const projection of projections ?? []) {
          if (projection.status !== 'published') continue;
          if (projection.brandId !== collection.brandId) continue;
          items.push(summarizeProjectionForPicker(projection));
        }
      }
      return Object.freeze({ items: Object.freeze(items), collectionStatus: collection.status });
    },

    async listCommercialPublicationsForActor(actorId, collectionId, { limit = 50, cursor = null } = {}) {
      invariant(Number.isInteger(limit) && limit > 0 && limit <= 200, 'COMMERCIAL_PUBLICATION_LIMIT_INVALID', 'Commercial publication page limit must be between 1 and 200', { limit });
      invariant(typeof commercialStore.listCommercialPublicationsByCollection === 'function', 'COMMERCIAL_PUBLICATION_QUERY_REQUIRED', 'Commercial publication query store is required');
      await publicationReadContext(actorId, collectionId);
      const decodedCursor = decodeCommercialPublicationCursor(cursor);
      const rows = await commercialStore.listCommercialPublicationsByCollection(collectionId, { limit, cursor: decodedCursor });
      const items = rows.slice(0, limit);
      const lastItem = items.at(-1);
      const nextCursor = rows.length > limit && lastItem ? encodeCommercialPublicationCursor({ publishedAt: lastItem.publishedAt, id: lastItem.id }) : null;
      return Object.freeze({ items: Object.freeze(items), nextCursor });
    },

    async getCommercialPublicationForActor(actorId, id) {
      const publication = requireEntity(await commercialStore.getCommercialPublication(id), 'COMMERCIAL_PUBLICATION_NOT_FOUND', { publicationId: id });
      return authorizePublicationRead(actorId, publication);
    },
    async getBuyerCatalogVersionForActor(actorId, id) {
      const buyerCatalog = requireEntity(await commercialStore.getBuyerCatalogVersion(id), 'BUYER_CATALOG_NOT_FOUND', { buyerCatalogVersionId: id });
      return authorizeBuyerCatalogRead(actorId, buyerCatalog);
    },
    async getBuyerCatalogForAccessForActor(actorId, showroomId, shopId) {
      invariant(typeof commercialStore.getBuyerCatalogForAccess === 'function', 'BUYER_CATALOG_ACCESS_QUERY_REQUIRED', 'Buyer catalog access query store is required');
      const buyerCatalog = requireEntity(await commercialStore.getBuyerCatalogForAccess(showroomId, shopId), 'BUYER_CATALOG_NOT_FOUND', { showroomId, shopId });
      return authorizeBuyerCatalogRead(actorId, buyerCatalog);
    },
    getCommercialPublication: (id) => commercialStore.getCommercialPublication(id),
    getBuyerCatalogVersion: (id) => commercialStore.getBuyerCatalogVersion(id),
    getBuyerCatalogForAccess: (showroomId, shopId) => commercialStore.getBuyerCatalogForAccess(showroomId, shopId),
  });
}

// Подпись проекции для выбора: код модели, её название на двух языках и номер версии — то,
// чем человек отличает одну проекцию от другой. Сама полезная нагрузка — это весь технический
// снимок модели со всеми цветами, атрибутами и доказательствами обмеров; в список выбора его
// везти незачем.
function summarizeProjectionForPicker(projection) {
  const product = projection?.payload?.technicalSnapshot?.product ?? {};
  return Object.freeze({
    id: projection.id,
    styleVersionId: projection.styleVersionId,
    versionNo: projection.versionNo,
    status: projection.status,
    styleCode: product.style?.styleCode ?? null,
    titleRu: product.styleVersion?.titleRu ?? null,
    titleEn: product.styleVersion?.titleEn ?? null,
    developmentRoute: projection?.payload?.developmentRoute ?? null,
  });
}

function defaultIdGenerator() { let sequence = 0; return (prefix) => `${prefix}_${++sequence}`; }
