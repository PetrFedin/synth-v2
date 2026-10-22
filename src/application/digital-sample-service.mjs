import { randomUUID } from 'node:crypto';
import { invariant, requireEntity } from '../core/errors.mjs';
import { CAPABILITIES } from '../modules/access-control/public.mjs';
import {
  digitalSampleId, digitalSampleCommandId, digitalSampleHash, digitalSampleTimestamp,
  normalizeDigitalSampleInput, createDigitalSampleVersion, freezeDigitalSample,
  assertDigitalSampleLineage, assertDigitalSampleIntegrity, normalizeDigitalSamplePage,
  normalizeScenarioInput, calculateDigitalSampleScenario,
} from '../modules/digital-samples/public.mjs';

const READ = CAPABILITIES.PRODUCT_READ;
const MANAGE = CAPABILITIES.PRODUCT_ENGINEERING_MANAGE;
const SCENARIO_READ = CAPABILITIES.MARGIN_READ;
const SCENARIO_WRITE = CAPABILITIES.COST_MANAGE;

/** @param {any} [options] */
export function createDigitalSampleService({ store, authorizeMembership,
  clock = () => new Date().toISOString(), nextId = prefix => `${prefix}_${randomUUID()}` } = {}) {
  invariant(typeof store?.transaction === 'function', 'DIGITAL_SAMPLE_STORE_REQUIRED', 'Transactional store required');
  invariant(typeof authorizeMembership === 'function', 'DIGITAL_SAMPLE_AUTHORIZER_REQUIRED', 'Native capability authorizer required');
  invariant(typeof clock === 'function' && typeof nextId === 'function', 'DIGITAL_SAMPLE_CONFIG_INVALID', 'Clock and ID factory required');

  async function authorize(tx, actorId, styleVersionId, capability) {
    digitalSampleId(actorId); digitalSampleId(styleVersionId);
    const style = requireEntity(await tx.getStyleVersion(styleVersionId), 'DIGITAL_SAMPLE_NOT_FOUND');
    const member = await tx.getMembership(style.brandId, actorId);
    invariant(member?.status === 'active' && member.organisationType === 'brand'
      && member.organisationId === style.brandId && member.userId === actorId,
      'DIGITAL_SAMPLE_NOT_FOUND', 'Context is unavailable');
    await authorizeMembership(member, capability);
    assertDigitalSampleLineage(style);
    return style;
  }

  function copy(value) { return freezeDigitalSample(structuredClone(value)); }

  async function eventAndCommand(tx, commandId, actorId, fingerprint, value, eventType, aggregateId) {
    await tx.appendOutbox({
      id: digitalSampleId(nextId('event')), type: eventType, aggregateId, occurredAt: value.createdAt,
      payload: {
        id: value.id, brandId: value.brandId, styleVersionId: value.styleVersionId,
        manifestHash: value.manifestHash, productionReady: false,
      },
      metadata: { commandId, actorId },
    });
    await tx.insertCommand({ id: commandId, actorId, fingerprint, result: value, completedAt: value.createdAt });
  }

  async function mutate(commandId, actorId, action, targetId, input, expectedHeadId = null) {
    digitalSampleCommandId(commandId); digitalSampleId(actorId); digitalSampleId(targetId);
    if (action === 'append') digitalSampleId(expectedHeadId);
    const normalized = normalizeDigitalSampleInput(input);
    const fingerprint = digitalSampleHash({
      scope: 'digital-samples', action, actorId, targetId, expectedHeadId, input: normalized,
    });
    return store.transaction(async tx => {
      const command = await tx.getCommand(commandId);
      const series = action === 'append'
        ? requireEntity(await tx.getSeries(targetId), 'DIGITAL_SAMPLE_NOT_FOUND')
        : null;
      const style = await authorize(tx, actorId, series?.styleVersionId ?? targetId, MANAGE);
      if (series) invariant(series.brandId === style.brandId && series.styleId === style.styleId,
        'DIGITAL_SAMPLE_LINEAGE_CONFLICT', 'Series does not match Product Identity');

      if (command) {
        invariant(command.actorId === actorId && command.fingerprint === fingerprint,
          'COMMAND_ID_CONFLICT', 'Command key was used for different content');
        assertDigitalSampleIntegrity(command.result);
        assertDigitalSampleLineage(style, command.result);
        return copy(command.result);
      }

      invariant(!['discontinued', 'rejected', 'superseded'].includes(style.lifecycleStatus),
        'DIGITAL_SAMPLE_LIFECYCLE_CONFLICT', 'Terminal styles cannot receive new sample revisions');

      const previous = series ? requireEntity(await tx.latest(series.id), 'DIGITAL_SAMPLE_NOT_FOUND') : null;
      if (series) invariant(previous.id === expectedHeadId, 'DIGITAL_SAMPLE_CONCURRENCY_CONFLICT',
        'Sample changed; reload its latest revision before saving', { actualHeadId: previous.id });

      const createdAt = digitalSampleTimestamp(clock());
      const seriesId = series?.id ?? digitalSampleId(nextId('digital-sample'));
      const value = createDigitalSampleVersion({
        id: nextId('digital-sample-version'), seriesId, styleVersion: style,
        previous, input: normalized, actorId, createdAt,
      });

      if (!series) await tx.insertSeries({
        id: seriesId, brandId: style.brandId, styleId: style.styleId,
        styleVersionId: style.id, createdAt, createdBy: actorId,
      });

      await tx.insertVersion(value);
      await eventAndCommand(tx, commandId, actorId, fingerprint, value, 'digital-sample.version-recorded', seriesId);
      return copy(value);
    });
  }

  async function authorizedVersion(tx, actorId, id, capability) {
    const record = requireEntity(await tx.getVersion(id), 'DIGITAL_SAMPLE_NOT_FOUND');
    const style = await authorize(tx, actorId, record.styleVersionId, capability);
    assertDigitalSampleIntegrity(record);
    assertDigitalSampleLineage(style, record);
    return { record, style };
  }

  function assertScenarioSource(record, sample) {
    invariant(record.sampleVersionId === sample.id && record.sampleManifestHash === sample.manifestHash,
      'DIGITAL_SAMPLE_SCENARIO_RESULT_INVALID', 'Scenario references another sample revision');
    invariant(record.inputHash === digitalSampleHash(record.calculation?.input)
      && digitalSampleHash(record.calculation) === digitalSampleHash(calculateDigitalSampleScenario(record.calculation.input)),
      'DIGITAL_SAMPLE_SCENARIO_RESULT_INVALID', 'Stored calculation does not match its declared inputs');
  }

  function pageResult(rows, limit, keyOf) {
    const items = rows.slice(0, limit);
    return copy({ items, nextCursor: rows.length > limit ? keyOf(items.at(-1)) : null });
  }

  return Object.freeze({
    create: (commandId, actorId, styleVersionId, input) =>
      mutate(commandId, actorId, 'create', styleVersionId, input),

    append: (commandId, actorId, seriesId, expectedHeadId, input) =>
      mutate(commandId, actorId, 'append', seriesId, input, expectedHeadId),

    get(actorId, versionId) {
      digitalSampleId(versionId);
      return store.transaction(async tx => copy((await authorizedVersion(tx, actorId, versionId, READ)).record));
    },

    list(actorId, styleVersionId, options = {}) {
      const { limit, afterId } = normalizeDigitalSamplePage(options);
      return store.transaction(async tx => {
        const style = await authorize(tx, actorId, styleVersionId, READ);
        const rows = await tx.list(styleVersionId, limit + 1, afterId);
        rows.forEach(row => { assertDigitalSampleIntegrity(row); assertDigitalSampleLineage(style, row); });
        return pageResult(rows, limit, row => row.seriesId);
      });
    },

    history(actorId, seriesId, options = {}) {
      digitalSampleId(seriesId);
      const { limit, afterId } = normalizeDigitalSamplePage(options);
      return store.transaction(async tx => {
        const series = requireEntity(await tx.getSeries(seriesId), 'DIGITAL_SAMPLE_NOT_FOUND');
        const style = await authorize(tx, actorId, series.styleVersionId, READ);
        const rows = await tx.history(seriesId, limit + 1, afterId);
        rows.forEach(row => { assertDigitalSampleIntegrity(row); assertDigitalSampleLineage(style, row); });
        return pageResult(rows, limit, row => row.id);
      });
    },

    createScenario(commandId, actorId, sampleVersionId, input) {
      digitalSampleCommandId(commandId); digitalSampleId(actorId); digitalSampleId(sampleVersionId);
      const normalized = normalizeScenarioInput(input);
      const fingerprint = digitalSampleHash({
        scope: 'digital-samples', action: 'scenario', actorId, sampleVersionId, input: normalized,
      });
      return store.transaction(async tx => {
        const command = await tx.getCommand(commandId);
        const { record: sample, style } = await authorizedVersion(tx, actorId, sampleVersionId, SCENARIO_WRITE);

        if (command) {
          invariant(command.actorId === actorId && command.fingerprint === fingerprint,
            'COMMAND_ID_CONFLICT', 'Command key was used for different content');
          assertDigitalSampleIntegrity(command.result);
          assertDigitalSampleLineage(style, command.result);
          assertScenarioSource(command.result, sample);
          return copy(command.result);
        }

        const body = {
          id: digitalSampleId(nextId('digital-scenario')),
          sampleVersionId,
          sampleManifestHash: sample.manifestHash,
          brandId: sample.brandId,
          styleId: sample.styleId,
          styleVersionId: sample.styleVersionId,
          styleVersionContentHash: sample.styleVersionContentHash,
          calculation: calculateDigitalSampleScenario(normalized),
          inputHash: digitalSampleHash(normalized),
          createdAt: digitalSampleTimestamp(clock()),
          createdBy: actorId,
          productionReady: false,
          dataClass: 'planning_estimate',
        };
        const value = freezeDigitalSample({ ...body, manifestHash: digitalSampleHash(body) });
        await tx.insertScenario(value);
        await eventAndCommand(
          tx, commandId, actorId, fingerprint, value, 'digital-sample.scenario-recorded', sampleVersionId,
        );
        return copy(value);
      });
    },

    listScenarios(actorId, sampleVersionId, options = {}) {
      digitalSampleId(sampleVersionId);
      const { limit, afterId } = normalizeDigitalSamplePage(options);
      return store.transaction(async tx => {
        const { style, record: sample } = await authorizedVersion(tx, actorId, sampleVersionId, SCENARIO_READ);
        const rows = await tx.listScenarios(sampleVersionId, limit + 1, afterId);
        rows.forEach(row => {
          assertDigitalSampleIntegrity(row);
          assertDigitalSampleLineage(style, row);
          assertScenarioSource(row, sample);
        });
        return pageResult(rows, limit, row => row.id);
      });
    },
  });
}
