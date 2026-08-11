import { invariant } from '../core/errors.mjs';
import { canonicalJson, fingerprintsMatch } from '../core/fingerprints.mjs';
import { CAPABILITIES, assertCapability } from '../modules/access-control/public.mjs';
import {
  createProductAttributeValue as createAttributeDomain,
  createProductCatalogSkuLink as createCatalogLinkDomain,
  createProductColorway as createColorwayDomain,
  createProductMedia as createMediaDomain,
  createProductSizeScale as createSizeScaleDomain,
  createProductSizeScaleVersion as createSizeScaleVersionDomain,
  createProductSizeValue as createSizeValueDomain,
  createProductSku as createSkuDomain,
  createProductStyle as createStyleDomain,
  createProductStyleVersion as createStyleVersionDomain,
  transitionProductStyle as transitionStyleDomain,
  updateProductSizeScale as updateSizeScaleDomain,
} from '../modules/product-identity/public.mjs';

const CATEGORY_DICTIONARIES = Object.freeze(['assortment.category']);
const PRODUCT_TYPE_DICTIONARIES = Object.freeze(['assortment.product_type']);
const GENDER_DICTIONARIES = Object.freeze(['assortment.gender']);
const COLOUR_DICTIONARIES = Object.freeze(['colour.colour']);
const SIZE_SYSTEM_DICTIONARIES = Object.freeze(['size.system']);
const SIZE_VALUE_DICTIONARIES = Object.freeze(['size.size', 'size.footwear_size', 'size.accessory_size']);

export function createProductIdentityService({ store, clock = () => new Date().toISOString(), nextId = defaultIdGenerator() } = {}) {
  invariant(store && typeof store.transaction === 'function', 'PRODUCT_IDENTITY_STORE_REQUIRED', 'Product Identity store is required');

  function execute(commandId, actorId, operation, input, prepare, action) {
    invariant(typeof commandId === 'string' && commandId.trim(), 'COMMAND_ID_REQUIRED', 'Every Product Identity mutation requires commandId');
    invariant(typeof actorId === 'string' && actorId.trim(), 'PRODUCT_IDENTITY_ACTOR_REQUIRED', 'Actor id is required');
    const fingerprint = `${operation}:${actorId}:${canonicalJson(input ?? {})}`;
    return store.transaction(async (tx) => {
      const previous = await tx.getCommand(commandId);
      if (previous) invariant(fingerprintsMatch(previous.fingerprint, fingerprint), 'COMMAND_ID_CONFLICT', 'commandId was already used by another mutation', { commandId });
      const context = await prepare(tx);
      if (previous) return previous.result;
      const result = await action(tx, context);
      await tx.insertCommand(Object.freeze({ id: commandId, fingerprint, actorId, result, completedAt: now(clock) }));
      return result;
    });
  }

  async function authorize(tx, brandId, actorId, capability = CAPABILITIES.PRODUCT_MANAGE) {
    invariant(typeof brandId === 'string' && brandId, 'PRODUCT_BRAND_REQUIRED', 'Brand id is required');
    const membership = await tx.getMembership(brandId, actorId);
    assertCapability(membership, capability);
    return membership;
  }

  async function resolveMdm(tx, ref, allowedDictionaryCodes, brandId, required = false) {
    if (ref === undefined || ref === null) {
      invariant(!required, 'PRODUCT_MDM_REFERENCE_REQUIRED', 'Required MDM reference is missing', { allowedDictionaryCodes });
      return null;
    }
    invariant(ref && typeof ref === 'object' && !Array.isArray(ref), 'PRODUCT_MDM_REFERENCE_INVALID', 'MDM reference must be an object');
    invariant(typeof ref.entryId === 'string' && ref.entryId, 'PRODUCT_MDM_REFERENCE_INVALID', 'MDM entryId is required');
    invariant(Number.isInteger(ref.version) && ref.version > 0, 'PRODUCT_MDM_REFERENCE_INVALID', 'MDM version must be a positive integer');
    const record = await tx.getMdmEntryVersion(ref.entryId, ref.version);
    invariant(record, 'PRODUCT_MDM_REFERENCE_NOT_FOUND', 'Exact MDM entry version was not found', { entryId: ref.entryId, version: ref.version });
    invariant(record.currentVersion === ref.version, 'PRODUCT_MDM_REFERENCE_STALE', 'New Product Identity facts must use the current MDM entry version', { entryId: ref.entryId, requestedVersion: ref.version, currentVersion: record.currentVersion });
    invariant(allowedDictionaryCodes === null || allowedDictionaryCodes.includes(record.dictionaryCode), 'PRODUCT_MDM_DICTIONARY_MISMATCH', 'MDM reference belongs to an incompatible dictionary', { entryId: ref.entryId, dictionaryCode: record.dictionaryCode, allowedDictionaryCodes });
    invariant(record.tenantId === null || record.tenantId === brandId, 'PRODUCT_MDM_TENANT_MISMATCH', 'MDM reference belongs to another tenant', { entryId: ref.entryId, brandId });
    invariant(record.status === 'active', 'PRODUCT_MDM_REFERENCE_INACTIVE', 'MDM reference must be active for new Product Identity facts', { entryId: ref.entryId, status: record.status });
    invariant(record.approvalStatus === 'approved' || record.approvalStatus === 'not_required', 'PRODUCT_MDM_REFERENCE_UNAPPROVED', 'MDM reference is not approved for use', { entryId: ref.entryId, approvalStatus: record.approvalStatus });
    const at = now(clock);
    invariant(record.validFrom === null || record.validFrom <= at, 'PRODUCT_MDM_REFERENCE_NOT_EFFECTIVE', 'MDM reference is not effective yet', { entryId: ref.entryId, validFrom: record.validFrom });
    invariant(record.validTo === null || record.validTo > at, 'PRODUCT_MDM_REFERENCE_EXPIRED', 'MDM reference is no longer effective', { entryId: ref.entryId, validTo: record.validTo });
    return record;
  }

  async function captureMdmUsage(tx, { brandId, sourceType, sourceId, fieldPath, record, actorId }) {
    if (!record) return;
    await tx.insertMdmUsageSnapshot(Object.freeze({
      id: nextId('mdm-usage'),
      tenantId: brandId,
      sourceType,
      sourceId,
      fieldPath,
      entryId: record.entryId,
      entryVersion: record.version,
      snapshot: record.snapshot,
      capturedAt: now(clock),
      capturedBy: actorId,
    }));
  }

  return Object.freeze({
    createStyle(commandId, actorId, input) {
      return execute(commandId, actorId, 'createProductStyle', input,
        async (tx) => {
          await authorize(tx, input?.brandId, actorId);
          return Object.freeze({ existing: await tx.getStyleByBrandAndCode(input.brandId, input.styleCode) });
        },
        async (tx, context) => {
          invariant(!context.existing, 'PRODUCT_STYLE_ALREADY_EXISTS', 'Product Style already exists', { brandId: input.brandId, styleCode: input.styleCode });
          const createdAt = now(clock);
          const value = createStyleDomain({ id: nextId('product-style'), brandId: input.brandId, styleCode: input.styleCode, createdAt, createdBy: actorId });
          await tx.insertStyle(value);
          return value;
        });
    },

    transitionStyle(commandId, actorId, styleId, input) {
      return execute(commandId, actorId, `transitionProductStyle:${styleId}`, input,
        async (tx) => {
          const style = requireEntity(await tx.getStyleForUpdate(styleId), 'PRODUCT_STYLE_NOT_FOUND', { styleId });
          await authorize(tx, style.brandId, actorId);
          assertExpectedVersion(style.version, input?.expectedVersion, 'PRODUCT_STYLE_CONCURRENCY_CONFLICT');
          return style;
        },
        async (tx, style) => {
          const value = transitionStyleDomain(style, input.nextStatus, { updatedAt: now(clock), updatedBy: actorId });
          await tx.saveStyle(value, input.expectedVersion);
          return value;
        });
    },

    createStyleVersion(commandId, actorId, styleId, input) {
      return execute(commandId, actorId, `createProductStyleVersion:${styleId}`, input,
        async (tx) => {
          const style = requireEntity(await tx.getStyleForUpdate(styleId), 'PRODUCT_STYLE_NOT_FOUND', { styleId });
          await authorize(tx, style.brandId, actorId);
          invariant(!['discontinued', 'rejected', 'superseded'].includes(style.lifecycleStatus), 'PRODUCT_STYLE_VERSION_TERMINAL_STYLE', 'Cannot create a technical version for a terminal Product Style', { styleId, lifecycleStatus: style.lifecycleStatus });
          const latest = await tx.getLatestStyleVersion(styleId);
          const expectedLatestVersionNo = input?.expectedLatestVersionNo;
          invariant(Number.isInteger(expectedLatestVersionNo) && expectedLatestVersionNo >= 0, 'PRODUCT_STYLE_VERSION_EXPECTATION_INVALID', 'expectedLatestVersionNo must be a non-negative integer');
          invariant((latest?.versionNo ?? 0) === expectedLatestVersionNo, 'PRODUCT_STYLE_VERSION_CONCURRENCY_CONFLICT', 'Product Style technical version changed', { styleId, expectedLatestVersionNo, actualLatestVersionNo: latest?.versionNo ?? 0 });
          const [category, productType, gender] = await Promise.all([
            resolveMdm(tx, input.categoryRef, CATEGORY_DICTIONARIES, style.brandId),
            resolveMdm(tx, input.productTypeRef, PRODUCT_TYPE_DICTIONARIES, style.brandId),
            resolveMdm(tx, input.genderRef, GENDER_DICTIONARIES, style.brandId),
          ]);
          return Object.freeze({ style, latest, category, productType, gender });
        },
        async (tx, context) => {
          const value = createStyleVersionDomain({
            id: nextId('product-style-version'),
            style: context.style,
            versionNo: (context.latest?.versionNo ?? 0) + 1,
            sourceStyleVersion: context.latest,
            titleRu: input.titleRu,
            titleEn: input.titleEn,
            categoryRef: input.categoryRef ?? null,
            productTypeRef: input.productTypeRef ?? null,
            genderRef: input.genderRef ?? null,
            technicalPayload: input.technicalPayload ?? {},
            createdAt: now(clock),
            createdBy: actorId,
          });
          await tx.insertStyleVersion(value);
          await captureMdmUsage(tx, { brandId: value.brandId, sourceType: 'product_style_version', sourceId: value.id, fieldPath: 'categoryRef', record: context.category, actorId });
          await captureMdmUsage(tx, { brandId: value.brandId, sourceType: 'product_style_version', sourceId: value.id, fieldPath: 'productTypeRef', record: context.productType, actorId });
          await captureMdmUsage(tx, { brandId: value.brandId, sourceType: 'product_style_version', sourceId: value.id, fieldPath: 'genderRef', record: context.gender, actorId });
          return value;
        });
    },

    createColorway(commandId, actorId, styleVersionId, input) {
      return execute(commandId, actorId, `createProductColorway:${styleVersionId}`, input,
        async (tx) => {
          const styleVersion = requireEntity(await tx.getStyleVersion(styleVersionId), 'PRODUCT_STYLE_VERSION_NOT_FOUND', { styleVersionId });
          await authorize(tx, styleVersion.brandId, actorId);
          const color = await resolveMdm(tx, input?.colorRef, COLOUR_DICTIONARIES, styleVersion.brandId);
          return Object.freeze({ styleVersion, color, existing: await tx.getColorwayByCode(styleVersionId, input?.colorwayCode) });
        },
        async (tx, context) => {
          invariant(!context.existing, 'PRODUCT_COLORWAY_ALREADY_EXISTS', 'Colorway code already exists for this Style Version', { styleVersionId, colorwayCode: input.colorwayCode });
          const value = createColorwayDomain({ id: nextId('product-colorway'), styleVersion: context.styleVersion, ...without(input, []), createdAt: now(clock), createdBy: actorId });
          await tx.insertColorway(value);
          await captureMdmUsage(tx, { brandId: value.brandId, sourceType: 'product_colorway', sourceId: value.id, fieldPath: 'colorRef', record: context.color, actorId });
          return value;
        });
    },

    createSizeScale(commandId, actorId, input) {
      return execute(commandId, actorId, 'createProductSizeScale', input,
        async (tx) => {
          await authorize(tx, input?.brandId, actorId);
          return Object.freeze({ existing: await tx.getSizeScaleByBrandAndCode(input.brandId, input.scaleCode) });
        },
        async (tx, context) => {
          invariant(!context.existing, 'PRODUCT_SIZE_SCALE_ALREADY_EXISTS', 'Product Size Scale already exists', { brandId: input.brandId, scaleCode: input.scaleCode });
          const value = createSizeScaleDomain({ id: nextId('product-size-scale'), ...input, createdAt: now(clock), createdBy: actorId });
          await tx.insertSizeScale(value);
          return value;
        });
    },

    updateSizeScale(commandId, actorId, sizeScaleId, input) {
      return execute(commandId, actorId, `updateProductSizeScale:${sizeScaleId}`, input,
        async (tx) => {
          const scale = requireEntity(await tx.getSizeScaleForUpdate(sizeScaleId), 'PRODUCT_SIZE_SCALE_NOT_FOUND', { sizeScaleId });
          await authorize(tx, scale.brandId, actorId);
          assertExpectedVersion(scale.version, input?.expectedVersion, 'PRODUCT_SIZE_SCALE_CONCURRENCY_CONFLICT');
          return scale;
        },
        async (tx, scale) => {
          const value = updateSizeScaleDomain(scale, { nameRu: input.nameRu, nameEn: input.nameEn, status: input.status, updatedAt: now(clock), updatedBy: actorId });
          await tx.saveSizeScale(value, input.expectedVersion);
          return value;
        });
    },

    createSizeScaleVersion(commandId, actorId, sizeScaleId, input) {
      return execute(commandId, actorId, `createProductSizeScaleVersion:${sizeScaleId}`, input,
        async (tx) => {
          const sizeScale = requireEntity(await tx.getSizeScaleForUpdate(sizeScaleId), 'PRODUCT_SIZE_SCALE_NOT_FOUND', { sizeScaleId });
          await authorize(tx, sizeScale.brandId, actorId);
          const latest = await tx.getLatestSizeScaleVersion(sizeScaleId);
          const expectedLatestVersionNo = input?.expectedLatestVersionNo;
          invariant(Number.isInteger(expectedLatestVersionNo) && expectedLatestVersionNo >= 0, 'PRODUCT_SIZE_SCALE_VERSION_EXPECTATION_INVALID', 'expectedLatestVersionNo must be a non-negative integer');
          invariant((latest?.versionNo ?? 0) === expectedLatestVersionNo, 'PRODUCT_SIZE_SCALE_VERSION_CONCURRENCY_CONFLICT', 'Product Size Scale version changed', { sizeScaleId, expectedLatestVersionNo, actualLatestVersionNo: latest?.versionNo ?? 0 });
          const sizeSystem = await resolveMdm(tx, input.sizeSystemRef, SIZE_SYSTEM_DICTIONARIES, sizeScale.brandId);
          return Object.freeze({ sizeScale, latest, sizeSystem });
        },
        async (tx, context) => {
          const value = createSizeScaleVersionDomain({ id: nextId('product-size-scale-version'), sizeScale: context.sizeScale, versionNo: (context.latest?.versionNo ?? 0) + 1, sourceSizeScaleVersion: context.latest, sizeSystemRef: input.sizeSystemRef ?? null, payload: input.payload ?? {}, createdAt: now(clock), createdBy: actorId });
          await tx.insertSizeScaleVersion(value);
          await captureMdmUsage(tx, { brandId: value.brandId, sourceType: 'product_size_scale_version', sourceId: value.id, fieldPath: 'sizeSystemRef', record: context.sizeSystem, actorId });
          return value;
        });
    },

    createSizeValue(commandId, actorId, sizeScaleVersionId, input) {
      return execute(commandId, actorId, `createProductSizeValue:${sizeScaleVersionId}`, input,
        async (tx) => {
          const sizeScaleVersion = requireEntity(await tx.getSizeScaleVersion(sizeScaleVersionId), 'PRODUCT_SIZE_SCALE_VERSION_NOT_FOUND', { sizeScaleVersionId });
          await authorize(tx, sizeScaleVersion.brandId, actorId);
          const size = await resolveMdm(tx, input?.sizeRef, SIZE_VALUE_DICTIONARIES, sizeScaleVersion.brandId);
          return Object.freeze({ sizeScaleVersion, size });
        },
        async (tx, context) => {
          const value = createSizeValueDomain({ id: nextId('product-size-value'), sizeScaleVersion: context.sizeScaleVersion, ...input, createdAt: now(clock), createdBy: actorId });
          await tx.insertSizeValue(value);
          await captureMdmUsage(tx, { brandId: value.brandId, sourceType: 'product_size_value', sourceId: value.id, fieldPath: 'sizeRef', record: context.size, actorId });
          return value;
        });
    },

    createSku(commandId, actorId, input) {
      return execute(commandId, actorId, 'createProductSku', input,
        async (tx) => {
          const styleVersion = requireEntity(await tx.getStyleVersion(input?.styleVersionId), 'PRODUCT_STYLE_VERSION_NOT_FOUND', { styleVersionId: input?.styleVersionId });
          await authorize(tx, styleVersion.brandId, actorId);
          const colorway = requireEntity(await tx.getColorway(input?.colorwayId), 'PRODUCT_COLORWAY_NOT_FOUND', { colorwayId: input?.colorwayId });
          const sizeValue = requireEntity(await tx.getSizeValue(input?.sizeValueId), 'PRODUCT_SIZE_VALUE_NOT_FOUND', { sizeValueId: input?.sizeValueId });
          return Object.freeze({ styleVersion, colorway, sizeValue, existing: await tx.getSkuByCode(input?.skuCode) });
        },
        async (tx, context) => {
          invariant(!context.existing, 'PRODUCT_SKU_ALREADY_EXISTS', 'Canonical Product SKU code already exists', { skuCode: input.skuCode });
          const value = createSkuDomain({ id: nextId('product-sku'), skuCode: input.skuCode, styleVersion: context.styleVersion, colorway: context.colorway, sizeValue: context.sizeValue, gtin: input.gtin ?? null, payload: input.payload ?? {}, createdAt: now(clock), createdBy: actorId });
          await tx.insertSku(value);
          return value;
        });
    },

    addMedia(commandId, actorId, styleVersionId, input) {
      return execute(commandId, actorId, `addProductMedia:${styleVersionId}`, input,
        async (tx) => {
          const styleVersion = requireEntity(await tx.getStyleVersion(styleVersionId), 'PRODUCT_STYLE_VERSION_NOT_FOUND', { styleVersionId });
          await authorize(tx, styleVersion.brandId, actorId);
          const colorway = input?.colorwayId ? requireEntity(await tx.getColorway(input.colorwayId), 'PRODUCT_COLORWAY_NOT_FOUND', { colorwayId: input.colorwayId }) : null;
          return Object.freeze({ styleVersion, colorway });
        },
        async (tx, context) => {
          const value = createMediaDomain({ id: nextId('product-media'), styleVersion: context.styleVersion, colorway: context.colorway, mediaType: input.mediaType, mediaRole: input.mediaRole, uri: input.uri, sortOrder: input.sortOrder, contentHash: input.contentHash ?? null, payload: input.payload ?? {}, createdAt: now(clock), createdBy: actorId });
          await tx.insertMedia(value);
          return value;
        });
    },

    createAttributeValue(commandId, actorId, input) {
      return execute(commandId, actorId, 'createProductAttributeValue', input,
        async (tx) => {
          const owner = requireEntity(await tx.getAttributeOwner(input?.ownerType, input?.ownerId), 'PRODUCT_ATTRIBUTE_OWNER_NOT_FOUND', { ownerType: input?.ownerType, ownerId: input?.ownerId });
          await authorize(tx, owner.brandId, actorId);
          const mdm = await resolveMdm(tx, input?.mdmRef, null, owner.brandId);
          return Object.freeze({ owner, mdm });
        },
        async (tx, context) => {
          const value = createAttributeDomain({ id: nextId('product-attribute-value'), ownerType: input.ownerType, owner: context.owner, attributeCode: input.attributeCode, attributeCatalogVersion: input.attributeCatalogVersion, value: input.value, mdmRef: input.mdmRef ?? null, createdAt: now(clock), createdBy: actorId });
          await tx.insertAttributeValue(value);
          await captureMdmUsage(tx, { brandId: value.brandId, sourceType: 'product_attribute_value', sourceId: value.id, fieldPath: 'mdmRef', record: context.mdm, actorId });
          return value;
        });
    },

    linkCatalogSku(commandId, actorId, productSkuId, input) {
      return execute(commandId, actorId, `linkProductCatalogSku:${productSkuId}`, input,
        async (tx) => {
          const productSku = requireEntity(await tx.getSku(productSkuId), 'PRODUCT_SKU_NOT_FOUND', { productSkuId });
          await authorize(tx, productSku.brandId, actorId);
          const catalogSku = requireEntity(await tx.getCatalogSku(input?.catalogSku), 'CATALOG_SKU_NOT_FOUND', { catalogSku: input?.catalogSku });
          return Object.freeze({ productSku, catalogSku });
        },
        async (tx, context) => {
          const value = createCatalogLinkDomain({ id: nextId('product-catalog-link'), productSku: context.productSku, catalogSku: context.catalogSku, brandId: context.productSku.brandId, linkedAt: now(clock), linkedBy: actorId });
          await tx.insertCatalogSkuLink(value);
          return value;
        });
    },
  });
}

function assertExpectedVersion(actualVersion, expectedVersion, code) {
  invariant(Number.isInteger(expectedVersion) && expectedVersion > 0, 'PRODUCT_EXPECTED_VERSION_INVALID', 'Expected version must be a positive integer');
  invariant(actualVersion === expectedVersion, code, 'Product Identity record changed concurrently', { expectedVersion, actualVersion });
}
function requireEntity(value, code, details) { invariant(value, code, 'Product Identity entity not found', details); return value; }
function now(clock) { const value = clock(); invariant(typeof value === 'string' && Number.isFinite(Date.parse(value)), 'PRODUCT_IDENTITY_CLOCK_INVALID', 'Product Identity clock must return an ISO-compatible string'); return new Date(value).toISOString(); }
function without(value, fields) { const blocked = new Set(fields); return Object.freeze(Object.fromEntries(Object.entries(value ?? {}).filter(([key]) => !blocked.has(key)))); }
function defaultIdGenerator() { let sequence = 0; return (prefix) => `${prefix}_${++sequence}`; }
