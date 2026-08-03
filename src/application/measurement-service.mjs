import { domainEvent } from '../core/events.mjs';
import { invariant } from '../core/errors.mjs';
import { canonicalJson, fingerprintsMatch } from '../core/fingerprints.mjs';
import { assertPostgresInteger } from '../core/money.mjs';
import { CAPABILITIES, assertCapability } from '../modules/access-control/public.mjs';
import {
  createMeasurementChart,
  publishMeasurementChart,
  updateDraftMeasurementChart,
} from '../modules/measurements/public.mjs';

const EDITABLE_FIELDS = Object.freeze(['unit', 'baseSizeCode', 'sizes', 'points', 'notes']);
const REQUIRED_SIZE_FIELDS = Object.freeze(['code', 'label']);
const REQUIRED_POINT_FIELDS = Object.freeze(['pointCode', 'name', 'description', 'toleranceMinus', 'tolerancePlus', 'measurements']);
const REQUIRED_VALUE_FIELDS = Object.freeze(['sizeCode', 'value']);
const UPDATE_FIELDS = Object.freeze(new Set(['expectedVersion', ...EDITABLE_FIELDS]));
const PUBLISH_FIELDS = Object.freeze(new Set(['expectedVersion']));

export function createMeasurementService({ measurementStore, clock = () => new Date().toISOString(), nextId = defaultIdGenerator() } = {}) {
  invariant(measurementStore && typeof measurementStore.transaction === 'function', 'MEASUREMENT_STORE_REQUIRED', 'Measurement chart store is required');

  async function authorisedSku(tx, skuCode, actorId) {
    const catalogSku = requireEntity(await tx.getSku(skuCode), 'CATALOG_SKU_NOT_FOUND', { sku: skuCode });
    const membership = await tx.getMembership(catalogSku.brandId, actorId);
    assertCapability(membership, CAPABILITIES.MEASUREMENT_MANAGE);
    return catalogSku;
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
    await tx.appendOutbox(domainEvent({
      id: nextId('event'),
      type,
      aggregateId: chart.id,
      occurredAt: clock(),
      payload: {
        sku: chart.sku,
        brandId: chart.brandId,
        skuVersion: chart.skuVersion,
        unit: chart.unit,
        baseSizeCode: chart.baseSizeCode,
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
        async (tx) => Object.freeze({
          catalogSku: await authorisedSku(tx, input.sku, actorId),
          existingChart: await tx.getMeasurementBySku(input.sku),
        }),
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
          const updated = updateDraftMeasurementChart(context.locked, { catalogSku: context.catalogSku, input: editable, updatedAt: clock() });
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
function assertRequiredObject(value, required, code, index, details = {}) {
  invariant(value && typeof value === 'object' && !Array.isArray(value), code, 'Measurement request item must be an object', { ...details, index });
  const missingFields = required.filter((field) => !Object.hasOwn(value, field)).sort();
  invariant(missingFields.length === 0, code, 'Measurement request item is missing required fields', { ...details, index, missingFields });
}
function expectedVersionOf(input) {
  return assertPostgresInteger(input.expectedVersion, { code: 'MEASUREMENT_EXPECTED_VERSION_INVALID', label: 'Expected measurement chart version', min: 1 });
}
function assertAllowedFields(input, allowed, code) {
  const forbidden = Object.keys(input).filter((field) => !allowed.has(field)).sort();
  invariant(forbidden.length === 0, code, 'Measurement chart request contains a forbidden field', { fields: forbidden });
}
function assertExpectedVersion(chart, expectedVersion) {
  invariant(chart.version === expectedVersion, 'MEASUREMENT_CONCURRENCY_CONFLICT', 'Measurement chart was changed by another operation', { sku: chart.sku, expectedVersion, actualVersion: chart.version });
}
function requireEntity(entity, code, details) { invariant(entity, code, 'Entity not found', details); return entity; }
function defaultIdGenerator() { let sequence = 0; return (prefix) => `${prefix}_${++sequence}`; }
