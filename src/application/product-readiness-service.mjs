import { invariant } from '../core/errors.mjs';
import { canonicalJson, fingerprintsMatch } from '../core/fingerprints.mjs';
import { CAPABILITIES, assertCapability } from '../modules/access-control/public.mjs';
import {
  createCommercialProductProjectionVersion,
  createProductReadinessSnapshot,
  evaluateProductReadiness,
} from '../modules/product-readiness/public.mjs';

export function createProductReadinessService({
  store,
  sourceReader,
  clock = () => new Date().toISOString(),
  nextId = defaultIdGenerator(),
} = {}) {
  invariant(store && typeof store.transaction === 'function', 'PRODUCT_READINESS_STORE_REQUIRED', 'Product readiness store is required');
  invariant(sourceReader && typeof sourceReader.getStyleVersion === 'function' && typeof sourceReader.loadAssessmentContext === 'function' && typeof sourceReader.getMembership === 'function', 'PRODUCT_READINESS_SOURCE_READER_REQUIRED', 'Product readiness source reader is required');

  async function authorizeStyleVersion(actorId, styleVersionId, capability) {
    const styleVersion = requireEntity(await sourceReader.getStyleVersion(styleVersionId), 'PRODUCT_STYLE_VERSION_NOT_FOUND', { styleVersionId });
    const membership = await sourceReader.getMembership(styleVersion.brandId, actorId);
    assertCapability(membership, capability);
    return styleVersion;
  }

  async function authorizeBrand(actorId, brandId, capability) {
    const membership = await sourceReader.getMembership(brandId, actorId);
    assertCapability(membership, capability);
  }

  async function replayOrExecute({ commandId, actorId, fingerprint, action }) {
    assertCommandId(commandId);
    return store.transaction(async (tx) => {
      const previous = await tx.getCommand(commandId);
      if (previous) invariant(fingerprintsMatch(previous.fingerprint, fingerprint), 'COMMAND_ID_CONFLICT', 'commandId was already used by another mutation', { commandId });
      if (previous) return previous.result;
      const result = await action(tx);
      await tx.insertCommand(Object.freeze({ id: commandId, fingerprint, actorId, result, completedAt: now(clock) }));
      return result;
    });
  }

  return Object.freeze({
    async assessReadiness(commandId, actorId, styleVersionId, input) {
      assertCommandId(commandId);
      assertAssessmentInput(input);
      const styleVersionIdentity = await authorizeStyleVersion(actorId, styleVersionId, CAPABILITIES.PRODUCT_MANAGE);
      const fingerprint = `assessProductReadiness:${actorId}:${styleVersionId}:${canonicalJson(input)}`;
      const existing = await store.transaction((tx) => tx.getCommand(commandId));
      if (existing) {
        invariant(fingerprintsMatch(existing.fingerprint, fingerprint), 'COMMAND_ID_CONFLICT', 'commandId was already used by another mutation', { commandId });
        return existing.result;
      }

      const context = requireEntity(await sourceReader.loadAssessmentContext(styleVersionId), 'PRODUCT_STYLE_VERSION_NOT_FOUND', { styleVersionId });
      invariant(context.styleVersion.brandId === styleVersionIdentity.brandId, 'PRODUCT_READINESS_SOURCE_BRAND_MISMATCH', 'Resolved readiness context belongs to another brand');
      const assessedAt = now(clock);
      const technicalSnapshot = deepFreeze({
        styleVersionId,
        brandId: styleVersionIdentity.brandId,
        capturedAt: assessedAt,
        product: context.product,
        legacyEvidence: context.legacyEvidence,
      });
      const commercialPreparation = normalizeCommercialPreparation(styleVersionIdentity.brandId, input.commercialPreparation);
      const dimensions = evaluateProductReadiness({
        developmentRoute: input.developmentRoute,
        technicalSnapshot,
        commercialPreparation,
        externalEvidence: input.externalEvidence ?? {},
      });
      const snapshot = createProductReadinessSnapshot({
        id: nextId('product-readiness'),
        styleVersion: styleVersionIdentity,
        developmentRoute: input.developmentRoute,
        dimensions,
        technicalSnapshot,
        commercialPreparation,
        assessedAt,
        assessedBy: actorId,
      });

      return replayOrExecute({
        commandId,
        actorId,
        fingerprint,
        action: async (tx) => {
          await tx.insertReadinessSnapshot(snapshot);
          return snapshot;
        },
      });
    },

    async publishCommercialProjection(commandId, actorId, readinessSnapshotId, input) {
      assertCommandId(commandId);
      assertProjectionInput(input);
      const readiness = requireEntity(await store.getReadinessSnapshot(readinessSnapshotId), 'PRODUCT_READINESS_NOT_FOUND', { readinessSnapshotId });
      await authorizeBrand(actorId, readiness.brandId, CAPABILITIES.CATALOG_MANAGE);
      const fingerprint = `publishCommercialProductProjection:${actorId}:${readinessSnapshotId}:${canonicalJson(input)}`;

      return replayOrExecute({
        commandId,
        actorId,
        fingerprint,
        action: async (tx) => {
          const exactReadiness = requireEntity(await tx.getReadinessSnapshotForUpdate(readinessSnapshotId), 'PRODUCT_READINESS_NOT_FOUND', { readinessSnapshotId });
          invariant(exactReadiness.readinessStatus === 'ready', 'COMMERCIAL_PROJECTION_READINESS_BLOCKED', 'Commercial Product Projection cannot publish from a blocked readiness snapshot', {
            readinessSnapshotId,
            blockedDimensionCount: exactReadiness.blockedDimensionCount,
          });
          await tx.lockStyleVersion(exactReadiness.styleVersionId);
          const latest = await tx.getLatestProjectionForUpdate(exactReadiness.styleVersionId);
          const actualLatestVersionNo = latest?.versionNo ?? 0;
          invariant(input.expectedLatestVersionNo === actualLatestVersionNo, 'COMMERCIAL_PROJECTION_CONCURRENCY_CONFLICT', 'Commercial Product Projection changed concurrently', {
            expectedLatestVersionNo: input.expectedLatestVersionNo,
            actualLatestVersionNo,
          });
          const projection = createCommercialProductProjectionVersion({
            id: nextId('commercial-product-projection'),
            readinessSnapshot: exactReadiness,
            versionNo: actualLatestVersionNo + 1,
            sourceProjection: latest ?? null,
            publishedAt: now(clock),
            publishedBy: actorId,
          });
          await tx.insertCommercialProjection(projection);
          return projection;
        },
      });
    },

    async getReadinessForActor(actorId, readinessSnapshotId) {
      const snapshot = requireEntity(await store.getReadinessSnapshot(readinessSnapshotId), 'PRODUCT_READINESS_NOT_FOUND', { readinessSnapshotId });
      await authorizeBrand(actorId, snapshot.brandId, CAPABILITIES.PRODUCT_READ);
      return snapshot;
    },

    async listReadinessForStyleVersion(actorId, styleVersionId, options = {}) {
      await authorizeStyleVersion(actorId, styleVersionId, CAPABILITIES.PRODUCT_READ);
      const limit = normalizeLimit(options.limit);
      return store.listReadinessByStyleVersion(styleVersionId, { limit });
    },

    async getCommercialProjectionForActor(actorId, projectionId) {
      const projection = requireEntity(await store.getCommercialProjection(projectionId), 'COMMERCIAL_PROJECTION_NOT_FOUND', { projectionId });
      await authorizeBrand(actorId, projection.brandId, CAPABILITIES.DEAL_READ);
      return projection;
    },

    async listCommercialProjectionsForStyleVersion(actorId, styleVersionId, options = {}) {
      const styleVersion = await authorizeStyleVersion(actorId, styleVersionId, CAPABILITIES.PRODUCT_READ);
      await authorizeBrand(actorId, styleVersion.brandId, CAPABILITIES.DEAL_READ);
      const limit = normalizeLimit(options.limit);
      return store.listCommercialProjectionsByStyleVersion(styleVersionId, { limit });
    },
  });
}

function assertCommandId(commandId) {
  invariant(typeof commandId === 'string' && commandId.trim(), 'COMMAND_ID_REQUIRED', 'Every readiness/projection mutation requires commandId');
}

function assertAssessmentInput(input) {
  invariant(input && typeof input === 'object' && !Array.isArray(input), 'PRODUCT_READINESS_INPUT_INVALID', 'Readiness assessment input is invalid');
  invariant(typeof input.developmentRoute === 'string', 'PRODUCT_READINESS_ROUTE_INVALID', 'developmentRoute is required');
  invariant(input.commercialPreparation && typeof input.commercialPreparation === 'object' && !Array.isArray(input.commercialPreparation), 'PRODUCT_READINESS_COMMERCIAL_PREPARATION_INVALID', 'commercialPreparation is required');
  invariant(input.externalEvidence === undefined || (input.externalEvidence && typeof input.externalEvidence === 'object' && !Array.isArray(input.externalEvidence)), 'PRODUCT_READINESS_EXTERNAL_EVIDENCE_INVALID', 'externalEvidence must be an object');
}

function assertProjectionInput(input) {
  invariant(input && typeof input === 'object' && !Array.isArray(input), 'COMMERCIAL_PROJECTION_INPUT_INVALID', 'Commercial projection input is invalid');
  invariant(Number.isInteger(input.expectedLatestVersionNo) && input.expectedLatestVersionNo >= 0, 'COMMERCIAL_PROJECTION_VERSION_EXPECTATION_INVALID', 'expectedLatestVersionNo must be a non-negative integer');
}

function normalizeCommercialPreparation(brandId, value) {
  const normalized = structuredClone(value);
  invariant(!Object.hasOwn(normalized, 'brandId') || normalized.brandId === brandId, 'PRODUCT_READINESS_COMMERCIAL_BRAND_MISMATCH', 'Client cannot assign commercial preparation to another brand');
  normalized.brandId = brandId;
  return deepFreeze(normalized);
}

function normalizeLimit(value) {
  if (value === undefined || value === null || value === '') return 50;
  const number = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  invariant(Number.isInteger(number) && number >= 1 && number <= 200, 'PRODUCT_READINESS_LIMIT_INVALID', 'Readiness/projection list limit must be between 1 and 200');
  return number;
}

function requireEntity(value, code, details) { invariant(value, code, 'Entity not found', details); return value; }
function now(clock) { const value = clock(); invariant(typeof value === 'string' && Number.isFinite(Date.parse(value)), 'PRODUCT_READINESS_CLOCK_INVALID', 'Clock must return an ISO-compatible string'); return new Date(value).toISOString(); }
function defaultIdGenerator() { let sequence = 0; return (prefix) => `${prefix}_${++sequence}`; }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const nested of Object.values(value)) deepFreeze(nested); return value; }
