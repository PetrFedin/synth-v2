import { randomUUID } from 'node:crypto';
import { domainEvent } from '../core/events.mjs';
import { invariant } from '../core/errors.mjs';
import { canonicalJson, fingerprintsMatch } from '../core/fingerprints.mjs';
import { CAPABILITIES, assertCapability } from '../modules/access-control/public.mjs';
import {
  createTargetPricePlan,
  publishTargetPricePlan,
  resolveSeasonRate,
  supersedeTargetPricePlan,
  targetPricing,
} from '../modules/target-pricing/public.mjs';

const RATE_FIELDS = Object.freeze(new Set(['brandId', 'campaignId', 'fromCurrency', 'toCurrency', 'rate', 'effectiveOn', 'sourceNote']));
const PLAN_FIELDS = Object.freeze(new Set(['brandId', 'sku', 'targetRrpMinor', 'rrpCurrency', 'retailMarkup', 'sourcingCountryCode', 'countryCoefficient', 'categoryCoefficient', 'fobCurrency', 'asOf', 'notes']));
const VERDICT_FIELDS = Object.freeze(new Set(['expectedVersion', 'reason']));

export function createTargetPricingService({ store, clock = () => new Date().toISOString(), nextId = defaultIdGenerator() } = {}) {
  invariant(store && typeof store.transaction === 'function', 'TARGET_PRICE_STORE_REQUIRED', 'Target pricing store is required');

  function execute(commandId, fingerprint, actorId, prepare, action) {
    invariant(typeof commandId === 'string' && commandId, 'COMMAND_ID_REQUIRED', 'Every mutation requires commandId');
    return store.transaction(async (tx) => {
      const previous = await tx.getCommand(commandId);
      if (previous) invariant(fingerprintsMatch(previous.fingerprint, fingerprint), 'COMMAND_ID_CONFLICT', 'commandId was already used by another mutation', { commandId });
      const context = await prepare(tx);
      if (previous) return previous.result;
      const result = await action(tx, context);
      await tx.insertCommand(Object.freeze({ id: commandId, fingerprint, actorId, result, completedAt: clock() }));
      return result;
    });
  }

  async function authorize(tx, brandId, actorId) {
    const membership = await tx.getMembership(brandId, actorId);
    assertCapability(membership, CAPABILITIES.COST_MANAGE);
    invariant(membership.organisationType === 'brand', 'TARGET_PRICE_BRAND_MEMBERSHIP_REQUIRED', 'Target pricing requires a brand membership', { brandId, actorId });
  }

  return Object.freeze({
    recordSeasonRate(commandId, actorId, input) {
      validateInput(input, RATE_FIELDS, 'TARGET_PRICE_INPUT_INVALID');
      return execute(commandId, `recordSeasonRate:${actorId}:${canonicalJson(input)}`, actorId,
        async (tx) => { await authorize(tx, input.brandId, actorId); return null; },
        async (tx) => {
          const value = Object.freeze({
            id: nextId('season-rate'), brandId: input.brandId, campaignId: input.campaignId,
            fromCurrency: input.fromCurrency, toCurrency: input.toCurrency, rate: Number(input.rate),
            effectiveOn: String(input.effectiveOn).slice(0, 10), sourceNote: input.sourceNote ?? null,
            createdAt: clock(), createdBy: actorId,
          });
          // Курс проходит через ту же проверку, что и разрешение курса при составлении плана: пара
          // валют, положительность и дата — одни правила на запись и на чтение.
          resolveSeasonRate({ rates: [value], fromCurrency: value.fromCurrency, toCurrency: value.toCurrency, asOf: value.effectiveOn });
          await tx.insertSeasonRate(value);
          await tx.appendOutbox(domainEvent({ id: nextId('event'), type: 'season-fx-rate.recorded', aggregateId: value.id, occurredAt: clock(), payload: { brandId: value.brandId, campaignId: value.campaignId, fromCurrency: value.fromCurrency, toCurrency: value.toCurrency, rate: value.rate, effectiveOn: value.effectiveOn }, metadata: { commandId, actorId } }));
          return value;
        });
    },

    createPlan(commandId, actorId, input) {
      validateInput(input, PLAN_FIELDS, 'TARGET_PRICE_INPUT_INVALID');
      return execute(commandId, `createTargetPricePlan:${actorId}:${canonicalJson(input)}`, actorId,
        async (tx) => {
          await authorize(tx, input.brandId, actorId);
          const sku = requireEntity(await tx.getCatalogSkuByCode(input.sku), 'CATALOG_SKU_NOT_FOUND', { sku: input.sku });
          invariant(sku.brandId === input.brandId, 'TARGET_PRICE_SKU_FOREIGN', 'This SKU belongs to another brand', { sku: input.sku });
          // Сезон изделия — кампания его коллекции. Спрашивать его отдельно значило бы позволить
          // назвать чужой сезон и считать по его курсам.
          const campaignId = requireEntity(await tx.getCampaignIdForSku(input.sku), 'TARGET_PRICE_SEASON_NOT_FOUND', { sku: input.sku });
          const rates = await tx.listSeasonRates(input.brandId, campaignId, input.fobCurrency, input.rrpCurrency);
          return Object.freeze({ campaignId, rates, existing: await tx.getActivePlanBySku(input.brandId, input.sku) });
        },
        async (tx, { campaignId, rates, existing }) => {
          invariant(!existing, 'TARGET_PRICE_PLAN_EXISTS', 'This product already has an active target price', { sku: input.sku });
          const rate = resolveSeasonRate({ rates, fromCurrency: input.fobCurrency, toCurrency: input.rrpCurrency, asOf: input.asOf ?? clock() });
          const value = createTargetPricePlan({ id: nextId('target-price'), brandId: input.brandId, campaignId, sku: input.sku, rate, input, createdAt: clock(), actorId });
          await tx.insertPlan(value);
          await tx.appendOutbox(domainEvent({
            id: nextId('event'), type: 'target-price.planned', aggregateId: value.id, occurredAt: clock(),
            payload: { brandId: value.brandId, sku: value.sku, campaignId, targetRrpMinor: value.targetRrpMinor, rrpCurrency: value.rrpCurrency, fobCurrency: value.fobCurrency, retailMarkup: value.retailMarkup },
            metadata: { commandId, actorId },
          }));
          return value;
        });
    },

    publish(commandId, actorId, planId, input) {
      validateInput(input, VERDICT_FIELDS, 'TARGET_PRICE_INPUT_INVALID');
      const expectedVersion = versionOf(input);
      return execute(commandId, `publishTargetPricePlan:${actorId}:${planId}:${expectedVersion}`, actorId,
        (tx) => planContext(tx, planId, actorId),
        (tx, plan) => {
          assertVersion(plan, expectedVersion);
          return savePlan(tx, publishTargetPricePlan(plan, { at: clock(), actorId }), expectedVersion, 'target-price.published', commandId, actorId);
        });
    },

    supersede(commandId, actorId, planId, input) {
      validateInput(input, VERDICT_FIELDS, 'TARGET_PRICE_INPUT_INVALID');
      const expectedVersion = versionOf(input);
      return execute(commandId, `supersedeTargetPricePlan:${actorId}:${planId}:${canonicalJson(input)}`, actorId,
        (tx) => planContext(tx, planId, actorId),
        (tx, plan) => {
          assertVersion(plan, expectedVersion);
          return savePlan(tx, supersedeTargetPricePlan(plan, { reason: input.reason, at: clock(), actorId }), expectedVersion, 'target-price.superseded', commandId, actorId);
        });
    },
  });

  async function planContext(tx, planId, actorId) {
    const plan = requireEntity(await tx.getPlanById(planId), 'TARGET_PRICE_PLAN_NOT_FOUND', { planId });
    await authorize(tx, plan.brandId, actorId);
    return plan;
  }
  async function savePlan(tx, value, expectedVersion, type, commandId, actorId) {
    await tx.savePlan(value, expectedVersion);
    await tx.appendOutbox(domainEvent({ id: nextId('event'), type, aggregateId: value.id, occurredAt: clock(), payload: { brandId: value.brandId, sku: value.sku, status: value.status }, metadata: { commandId, actorId } }));
    return value;
  }
}

export function createTargetPricingQueryService({ reader } = {}) {
  invariant(reader && typeof reader.plansForActor === 'function' && typeof reader.planForSku === 'function', 'TARGET_PRICE_READER_REQUIRED', 'Target pricing reader is required');
  return Object.freeze({
    // Цель и то, с чем её сравнивают, читаются вместе: котировка фабрики из подтверждённого заказа
    // и себестоимость по опубликованной ведомости. Цифры целей считаются при чтении.
    async targetPricePlansForActor(actorId) {
      const rows = await reader.plansForActor(actorId);
      invariant(Array.isArray(rows), 'TARGET_PRICE_LISTING_INVALID', 'Target price listing is invalid');
      return Object.freeze(rows.map((row) => targetPricing(row.plan, row)));
    },
    async targetPricePlanForSku(actorId, sku) {
      const row = await reader.planForSku(actorId, sku);
      invariant(row, 'TARGET_PRICE_PLAN_NOT_FOUND', 'This product has no active target price', { sku });
      return targetPricing(row.plan, row);
    },
  });
}

function validateInput(input, allowed, code) {
  invariant(input && typeof input === 'object' && !Array.isArray(input), code, 'Input must be an object');
  for (const key of Object.keys(input)) invariant(allowed.has(key), code, `Unexpected field ${key}`, { field: key });
}
function versionOf(input) {
  invariant(Number.isInteger(input.expectedVersion) && input.expectedVersion >= 1, 'TARGET_PRICE_EXPECTED_VERSION_INVALID', 'Expected version is invalid');
  return input.expectedVersion;
}
function assertVersion(plan, expectedVersion) {
  invariant(plan.version === expectedVersion, 'TARGET_PRICE_CONCURRENCY_CONFLICT', 'This target price was changed by another operation', { sku: plan.sku, expectedVersion, actualVersion: plan.version });
}
function requireEntity(value, code, details) { invariant(value, code, code.replace(/_/g, ' ').toLowerCase(), details); return value; }
function defaultIdGenerator() { return (prefix) => `${prefix}_${randomUUID()}`; }
