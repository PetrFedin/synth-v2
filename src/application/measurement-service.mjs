import { domainEvent } from '../core/events.mjs';
import { invariant } from '../core/errors.mjs';
import { canonicalJson, fingerprintsMatch } from '../core/fingerprints.mjs';
import { assertPostgresInteger } from '../core/money.mjs';
import { CAPABILITIES, assertCapability } from '../modules/access-control/public.mjs';
import {
  createCanonicalMeasurementChart,
  createMeasurementChart,
  publishCanonicalMeasurementChart,
  publishMeasurementChart,
  revisePublishedCanonicalMeasurementChart,
  revisePublishedMeasurementChart,
  updateCanonicalDraftMeasurementChart,
  updateDraftMeasurementChart,
} from '../modules/measurements/public.mjs';

const EDITABLE_FIELDS = Object.freeze(['unit', 'baseSizeCode', 'sizes', 'points', 'notes']);
const REQUIRED_SIZE_FIELDS = Object.freeze(['code', 'label']);
const REQUIRED_POINT_FIELDS = Object.freeze(['pointCode', 'name', 'description', 'toleranceMinus', 'tolerancePlus', 'measurements']);
const REQUIRED_VALUE_FIELDS = Object.freeze(['sizeCode', 'value']);
const UPDATE_FIELDS = Object.freeze(new Set(['expectedVersion', ...EDITABLE_FIELDS]));
const PUBLISH_FIELDS = Object.freeze(new Set(['expectedVersion']));
const CANONICAL_IDENTITY_FIELDS = Object.freeze(['styleVersionId', 'colorwayId', 'sizeScaleVersionId']);
const CANONICAL_EDITABLE_FIELDS = Object.freeze(['measurementUnitEntryId', 'baseSizeValueId', 'sizes', 'points', 'notes']);
const CANONICAL_CREATE_FIELDS = Object.freeze(new Set([...CANONICAL_IDENTITY_FIELDS, ...CANONICAL_EDITABLE_FIELDS]));
const CANONICAL_UPDATE_FIELDS = Object.freeze(new Set(['expectedVersion', ...CANONICAL_EDITABLE_FIELDS]));
const CANONICAL_SIZE_FIELDS = Object.freeze(['sizeValueId']);
const CANONICAL_POINT_FIELDS = Object.freeze(['pointEntryId', 'description', 'toleranceMinus', 'tolerancePlus', 'measurements']);
const CANONICAL_VALUE_FIELDS = Object.freeze(['sizeValueId', 'value']);

export function createMeasurementService({ measurementStore, clock = () => new Date().toISOString(), nextId = defaultIdGenerator() } = {}) {
  invariant(measurementStore && typeof measurementStore.transaction === 'function', 'MEASUREMENT_STORE_REQUIRED', 'Measurement chart store is required');

  async function authorisedSku(tx, skuCode, actorId) {
    const catalogSku = requireEntity(await tx.getSku(skuCode), 'CATALOG_SKU_NOT_FOUND', { sku: skuCode });
    const membership = await tx.getMembership(catalogSku.brandId, actorId);
    assertCapability(membership, CAPABILITIES.MEASUREMENT_MANAGE);
    return catalogSku;
  }

  async function canonicalContext(tx, actorId, identity, editable) {
    const styleVersion = requireEntity(await tx.getStyleVersion(identity.styleVersionId), 'PRODUCT_STYLE_VERSION_NOT_FOUND', { styleVersionId: identity.styleVersionId });
    const membership = await tx.getMembership(styleVersion.brandId, actorId);
    assertCapability(membership, CAPABILITIES.MEASUREMENT_MANAGE);
    const [colorway, sizeScaleVersion, sizeValues, measurementUnit] = await Promise.all([
      tx.getColorway(identity.colorwayId),
      tx.getSizeScaleVersion(identity.sizeScaleVersionId),
      tx.getSizeValuesForScaleVersion(identity.sizeScaleVersionId),
      tx.getCurrentMdmEntry(editable.measurementUnitEntryId),
    ]);
    requireEntity(colorway, 'PRODUCT_COLORWAY_NOT_FOUND', { colorwayId: identity.colorwayId });
    requireEntity(sizeScaleVersion, 'PRODUCT_SIZE_SCALE_VERSION_NOT_FOUND', { sizeScaleVersionId: identity.sizeScaleVersionId });
    requireEntity(measurementUnit, 'MDM_ENTRY_NOT_FOUND', { entryId: editable.measurementUnitEntryId });
    assertMdmEffective(measurementUnit, clock());

    const pointEntryIds = unique((editable.points || []).map((point) => point.pointEntryId));
    const pointEntries = [];
    for (const pointEntryId of pointEntryIds) {
      const pointEntry = requireEntity(await tx.getCurrentMdmEntry(pointEntryId), 'MDM_ENTRY_NOT_FOUND', { entryId: pointEntryId });
      assertMdmEffective(pointEntry, clock());
      pointEntries.push(pointEntry);
    }
    return Object.freeze({ styleVersion, colorway, sizeScaleVersion, sizeValues, measurementUnit, pointEntries: Object.freeze(pointEntries) });
  }

  function execute(commandId, fingerprint, actorId, prepare, action) {
    invariant(commandId, 'COMMAND_ID_REQUIRED', 'Every mutation requires commandId');
    return measurementStore.transaction(async (tx) => {
      const previous = await tx.getCommand(commandId);
      if (previous) invariant(fingerprintsMatch(previous.fingerprint, fingerprint), 'COMMAND_ID_CONFLICT', 'commandId was already used by another mutation', { commandId });
      const prepared = await prepare(tx);
      if (previous) return previous.result;
      const result = await action(tx, prepared);
      await tx.insertCommand(Object.freeze({ id: commandId, fingerprint, actorId, result, completedAt: clock() }));
      return result;
    });
  }

  async function append(tx, type, chart, commandId, actorId) {
    const canonical = Boolean(chart.styleVersionId);
    await tx.appendOutbox(domainEvent({
      id: nextId('event'),
      type,
      aggregateId: chart.id,
      occurredAt: clock(),
      payload: {
        identityKind: canonical ? 'product_identity' : 'legacy_catalog_sku',
        sku: chart.sku,
        brandId: chart.brandId,
        skuVersion: chart.skuVersion,
        styleVersionId: chart.styleVersionId ?? null,
        colorwayId: chart.colorwayId ?? null,
        sizeScaleVersionId: chart.sizeScaleVersionId ?? null,
        measurementUnitEntryId: chart.measurementUnitEntryId ?? null,
        measurementUnitEntryVersion: chart.measurementUnitEntryVersion ?? null,
        unit: chart.unit,
        baseSizeCode: chart.baseSizeCode,
        baseSizeValueId: chart.baseSizeValueId ?? null,
        sizeCount: chart.sizes.length,
        pointCount: chart.points.length,
        version: chart.version,
        status: chart.status,
      },
      metadata: { commandId, actorId },
    }));
  }

  return Object.freeze({
    async createMeasurementChart(commandId, actorId, input) {
      assertCompleteInput(input, { includeSku: true });
      return execute(
        commandId,
        `createMeasurementChart:${actorId}:${canonicalJson(input)}`,
        actorId,
        async (tx) => Object.freeze({ catalogSku: await authorisedSku(tx, input.sku, actorId), existingChart: await tx.getMeasurementBySku(input.sku) }),
        async (tx, context) => {
          invariant(!context.existingChart, 'MEASUREMENT_ALREADY_EXISTS', 'Measurement chart already exists for SKU', { sku: context.catalogSku.sku });
          const chart = createMeasurementChart({ id: nextId('measurement'), catalogSku: context.catalogSku, input, createdAt: clock() });
          await tx.insertMeasurement(chart);
          await append(tx, 'measurement.created', chart, commandId, actorId);
          return chart;
        },
      );
    },

    async updateMeasurementChart(commandId, actorId, skuCode, input) {
      assertCompleteInput(input, { includeExpectedVersion: true });
      assertAllowedFields(input, UPDATE_FIELDS, 'MEASUREMENT_UPDATE_FIELD_FORBIDDEN');
      const expectedVersion = expectedVersionOf(input);
      const editable = Object.freeze(Object.fromEntries(Object.entries(input).filter(([field]) => field !== 'expectedVersion')));
      return execute(
        commandId,
        `updateMeasurementChart:${actorId}:${skuCode}:${canonicalJson({ expectedVersion, ...editable })}`,
        actorId,
        async (tx) => Object.freeze({
          locked: requireEntity(await tx.getMeasurementBySku(skuCode), 'MEASUREMENT_NOT_FOUND', { sku: skuCode }),
          catalogSku: await authorisedSku(tx, skuCode, actorId),
        }),
        async (tx, context) => {
          assertExpectedVersion(context.locked, expectedVersion);
          const changedAt = clock();
          if (context.locked.status === 'published') {
            invariant(typeof tx.archiveMeasurementRevision === 'function', 'MEASUREMENT_REVISION_STORE_REQUIRED', 'Measurement revision archive is required');
            const revised = revisePublishedMeasurementChart(context.locked, { catalogSku: context.catalogSku, input: editable, revisedAt: changedAt });
            await tx.archiveMeasurementRevision(context.locked, changedAt);
            await tx.saveMeasurement(revised, expectedVersion);
            await append(tx, 'measurement.revision-started', revised, commandId, actorId);
            return revised;
          }
          const updated = updateDraftMeasurementChart(context.locked, { catalogSku: context.catalogSku, input: editable, updatedAt: changedAt });
          if (updated === context.locked) return context.locked;
          await tx.saveMeasurement(updated, expectedVersion);
          await append(tx, 'measurement.updated', updated, commandId, actorId);
          return updated;
        },
      );
    },

    async publishMeasurementChart(commandId, actorId, skuCode, input) {
      invariant(input && typeof input === 'object' && !Array.isArray(input), 'MEASUREMENT_PUBLISH_INVALID', 'Measurement chart publication request is invalid');
      assertAllowedFields(input, PUBLISH_FIELDS, 'MEASUREMENT_PUBLISH_FIELD_FORBIDDEN');
      const expectedVersion = expectedVersionOf(input);
      return execute(
        commandId,
        `publishMeasurementChart:${actorId}:${skuCode}:${expectedVersion}`,
        actorId,
        async (tx) => Object.freeze({
          locked: requireEntity(await tx.getMeasurementBySku(skuCode), 'MEASUREMENT_NOT_FOUND', { sku: skuCode }),
          catalogSku: await authorisedSku(tx, skuCode, actorId),
        }),
        async (tx, context) => {
          assertExpectedVersion(context.locked, expectedVersion);
          const published = publishMeasurementChart(context.locked, { catalogSku: context.catalogSku, publishedAt: clock() });
          await tx.saveMeasurement(published, expectedVersion);
          await append(tx, 'measurement.published', published, commandId, actorId);
          return published;
        },
      );
    },

    async createCanonicalMeasurementChart(commandId, actorId, input) {
      assertCanonicalCompleteInput(input, { includeIdentity: true });
      assertAllowedFields(input, CANONICAL_CREATE_FIELDS, 'MEASUREMENT_CANONICAL_FIELD_FORBIDDEN');
      const identity = canonicalIdentityOf(input);
      return execute(
        commandId,
        `createCanonicalMeasurementChart:${actorId}:${canonicalJson(input)}`,
        actorId,
        async (tx) => Object.freeze({
          context: await canonicalContext(tx, actorId, identity, input),
          existingChart: await tx.getCanonicalMeasurement(identity.styleVersionId, identity.colorwayId, identity.sizeScaleVersionId),
        }),
        async (tx, prepared) => {
          invariant(!prepared.existingChart, 'MEASUREMENT_ALREADY_EXISTS', 'Canonical Measurement Chart already exists for this Product Identity context', identity);
          const chart = createCanonicalMeasurementChart({ id: nextId('measurement'), context: prepared.context, input, createdAt: clock() });
          await tx.insertCanonicalMeasurement(chart);
          await append(tx, 'measurement.created', chart, commandId, actorId);
          return chart;
        },
      );
    },

    async updateCanonicalMeasurementChart(commandId, actorId, chartId, input) {
      assertCanonicalCompleteInput(input, { includeExpectedVersion: true });
      assertAllowedFields(input, CANONICAL_UPDATE_FIELDS, 'MEASUREMENT_CANONICAL_UPDATE_FIELD_FORBIDDEN');
      const expectedVersion = expectedVersionOf(input);
      const editable = Object.freeze(Object.fromEntries(Object.entries(input).filter(([field]) => field !== 'expectedVersion')));
      return execute(
        commandId,
        `updateCanonicalMeasurementChart:${actorId}:${chartId}:${canonicalJson(input)}`,
        actorId,
        async (tx) => {
          const locked = requireCanonical(requireEntity(await tx.getMeasurementById(chartId), 'MEASUREMENT_NOT_FOUND', { chartId }));
          const identity = canonicalIdentityOf(locked);
          return Object.freeze({ locked, context: await canonicalContext(tx, actorId, identity, editable) });
        },
        async (tx, prepared) => {
          assertExpectedVersion(prepared.locked, expectedVersion);
          const changedAt = clock();
          if (prepared.locked.status === 'published') {
            const revised = revisePublishedCanonicalMeasurementChart(prepared.locked, { context: prepared.context, input: editable, revisedAt: changedAt });
            await tx.archiveCanonicalMeasurementRevision(prepared.locked, changedAt);
            await tx.saveCanonicalMeasurement(revised, expectedVersion);
            await append(tx, 'measurement.revision-started', revised, commandId, actorId);
            return revised;
          }
          const updated = updateCanonicalDraftMeasurementChart(prepared.locked, { context: prepared.context, input: editable, updatedAt: changedAt });
          if (updated === prepared.locked) return prepared.locked;
          await tx.saveCanonicalMeasurement(updated, expectedVersion);
          await append(tx, 'measurement.updated', updated, commandId, actorId);
          return updated;
        },
      );
    },

    async publishCanonicalMeasurementChart(commandId, actorId, chartId, input) {
      invariant(input && typeof input === 'object' && !Array.isArray(input), 'MEASUREMENT_PUBLISH_INVALID', 'Measurement chart publication request is invalid');
      assertAllowedFields(input, PUBLISH_FIELDS, 'MEASUREMENT_PUBLISH_FIELD_FORBIDDEN');
      const expectedVersion = expectedVersionOf(input);
      return execute(
        commandId,
        `publishCanonicalMeasurementChart:${actorId}:${chartId}:${expectedVersion}`,
        actorId,
        async (tx) => {
          const locked = requireCanonical(requireEntity(await tx.getMeasurementById(chartId), 'MEASUREMENT_NOT_FOUND', { chartId }));
          const styleVersion = requireEntity(await tx.getStyleVersion(locked.styleVersionId), 'PRODUCT_STYLE_VERSION_NOT_FOUND', { styleVersionId: locked.styleVersionId });
          invariant(styleVersion.brandId === locked.brandId, 'MEASUREMENT_BRAND_MISMATCH', 'Canonical Measurement Chart brand lineage is invalid');
          const membership = await tx.getMembership(locked.brandId, actorId);
          assertCapability(membership, CAPABILITIES.MEASUREMENT_MANAGE);
          return Object.freeze({ locked });
        },
        async (tx, prepared) => {
          assertExpectedVersion(prepared.locked, expectedVersion);
          const published = publishCanonicalMeasurementChart(prepared.locked, { publishedAt: clock() });
          await tx.saveCanonicalMeasurement(published, expectedVersion);
          await append(tx, 'measurement.published', published, commandId, actorId);
          return published;
        },
      );
    },
  });
}

function assertCompleteInput(input, { includeSku = false, includeExpectedVersion = false } = {}) {
  invariant(input && typeof input === 'object' && !Array.isArray(input), 'MEASUREMENT_INPUT_INVALID', 'Measurement chart input is invalid');
  const required = [...(includeSku ? ['sku'] : []), ...(includeExpectedVersion ? ['expectedVersion'] : []), ...EDITABLE_FIELDS];
  const missingFields = required.filter((field) => !Object.hasOwn(input, field)).sort();
  invariant(missingFields.length === 0, 'MEASUREMENT_FIELD_REQUIRED', 'Measurement chart request is missing required fields', { missingFields });
  invariant(Array.isArray(input.sizes), 'MEASUREMENT_SIZES_INVALID', 'Measurement sizes must be an array');
  input.sizes.forEach((size, index) => assertRequiredObject(size, REQUIRED_SIZE_FIELDS, 'MEASUREMENT_SIZE_FIELD_REQUIRED', index));
  invariant(Array.isArray(input.points), 'MEASUREMENT_POINTS_INVALID', 'Measurement points must be an array');
  input.points.forEach((point, pointIndex) => {
    assertRequiredObject(point, REQUIRED_POINT_FIELDS, 'MEASUREMENT_POINT_FIELD_REQUIRED', pointIndex);
    invariant(Array.isArray(point.measurements), 'MEASUREMENT_VALUES_INVALID', 'Point measurements must be an array', { pointIndex });
    point.measurements.forEach((measurement, valueIndex) => assertRequiredObject(measurement, REQUIRED_VALUE_FIELDS, 'MEASUREMENT_VALUE_FIELD_REQUIRED', valueIndex, { pointIndex }));
  });
}

function assertCanonicalCompleteInput(input, { includeIdentity = false, includeExpectedVersion = false } = {}) {
  invariant(input && typeof input === 'object' && !Array.isArray(input), 'MEASUREMENT_INPUT_INVALID', 'Canonical Measurement Chart input is invalid');
  const required = [...(includeIdentity ? CANONICAL_IDENTITY_FIELDS : []), ...(includeExpectedVersion ? ['expectedVersion'] : []), ...CANONICAL_EDITABLE_FIELDS];
  const missingFields = required.filter((field) => !Object.hasOwn(input, field)).sort();
  invariant(missingFields.length === 0, 'MEASUREMENT_FIELD_REQUIRED', 'Canonical Measurement Chart request is missing required fields', { missingFields });
  invariant(Array.isArray(input.sizes), 'MEASUREMENT_SIZES_INVALID', 'Canonical measurement sizes must be an array');
  input.sizes.forEach((size, index) => assertRequiredObject(size, CANONICAL_SIZE_FIELDS, 'MEASUREMENT_SIZE_FIELD_REQUIRED', index));
  invariant(Array.isArray(input.points), 'MEASUREMENT_POINTS_INVALID', 'Canonical measurement points must be an array');
  input.points.forEach((point, pointIndex) => {
    assertRequiredObject(point, CANONICAL_POINT_FIELDS, 'MEASUREMENT_POINT_FIELD_REQUIRED', pointIndex);
    invariant(Array.isArray(point.measurements), 'MEASUREMENT_VALUES_INVALID', 'Canonical point measurements must be an array', { pointIndex });
    point.measurements.forEach((measurement, valueIndex) => assertRequiredObject(measurement, CANONICAL_VALUE_FIELDS, 'MEASUREMENT_VALUE_FIELD_REQUIRED', valueIndex, { pointIndex }));
  });
}

function assertRequiredObject(value, required, code, index, details = {}) {
  invariant(value && typeof value === 'object' && !Array.isArray(value), code, 'Measurement request item must be an object', { ...details, index });
  const missingFields = required.filter((field) => !Object.hasOwn(value, field)).sort();
  invariant(missingFields.length === 0, code, 'Measurement request item is missing required fields', { ...details, index, missingFields });
}
function expectedVersionOf(input) { return assertPostgresInteger(input.expectedVersion, { code: 'MEASUREMENT_EXPECTED_VERSION_INVALID', label: 'Expected measurement chart version', min: 1 }); }
function assertAllowedFields(input, allowed, code) {
  const forbidden = Object.keys(input).filter((field) => !allowed.has(field)).sort();
  invariant(forbidden.length === 0, code, 'Measurement chart request contains a forbidden field', { fields: forbidden });
}
function assertExpectedVersion(chart, expectedVersion) { invariant(chart.version === expectedVersion, 'MEASUREMENT_CONCURRENCY_CONFLICT', 'Measurement chart was changed by another operation', { chartId: chart.id, sku: chart.sku, expectedVersion, actualVersion: chart.version }); }
function canonicalIdentityOf(value) { return Object.freeze({ styleVersionId: value.styleVersionId, colorwayId: value.colorwayId, sizeScaleVersionId: value.sizeScaleVersionId }); }
function requireCanonical(chart) { invariant(chart?.styleVersionId && chart?.colorwayId && chart?.sizeScaleVersionId && chart?.sku === null, 'MEASUREMENT_CANONICAL_REQUIRED', 'Canonical Measurement Chart is required'); return chart; }
function requireEntity(entity, code, details) { invariant(entity, code, 'Entity not found', details); return entity; }
function unique(values) { return [...new Set(values.filter((value) => typeof value === 'string' && value))]; }
function assertMdmEffective(reference, at) {
  const timestamp = Date.parse(at);
  invariant(Number.isFinite(timestamp), 'MEASUREMENT_CLOCK_INVALID', 'Measurement clock must return an ISO-compatible timestamp');
  const from = reference.validFrom ? Date.parse(reference.validFrom) : Number.NEGATIVE_INFINITY;
  const to = reference.validTo ? Date.parse(reference.validTo) : Number.POSITIVE_INFINITY;
  invariant(timestamp >= from && timestamp < to, 'MEASUREMENT_MDM_NOT_EFFECTIVE', 'MDM entry is not effective for the canonical Measurement Chart', { entryId: reference.entryId, validFrom: reference.validFrom, validTo: reference.validTo, at });
}
function defaultIdGenerator() { let sequence = 0; return (prefix) => `${prefix}_${++sequence}`; }
