import { invariant } from '../../core/errors.mjs';
import { requiredText } from '../../core/validation.mjs';

// A Placeholder is a planned assortment slot. It exists before any style does: the buyer plans what
// the season must contain and what it has to earn, and development is then measured against it.
// Everything a placeholder carries is a target, never a fact.

const PLACEHOLDER_CODE_PATTERN = /^[A-Z0-9][A-Z0-9._/-]{1,63}$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;

export const PLACEHOLDER_STATUSES = Object.freeze(['planned', 'in_development', 'delivered', 'dropped']);

const placeholderTransitions = new Map([
  ['planned', new Set(['in_development', 'dropped'])],
  ['in_development', new Set(['delivered', 'dropped'])],
  ['delivered', new Set(['dropped'])],
  ['dropped', new Set()],
]);

function optionalPositiveInteger(value, code, label) {
  if (value === null || value === undefined) return null;
  invariant(Number.isInteger(value) && value > 0, code, `${label} must be a positive integer`, { value });
  return value;
}

function optionalMinor(value, code, label) {
  if (value === null || value === undefined) return null;
  invariant(Number.isInteger(value) && value >= 0, code, `${label} must be a non-negative integer amount in minor units`, { value });
  return value;
}

function optionalIsoDate(value, code, label) {
  if (value === null || value === undefined) return null;
  invariant(typeof value === 'string' && !Number.isNaN(Date.parse(value)), code, `${label} must be an ISO timestamp`, { value });
  return value;
}

function normalizeMdmRef(ref, code) {
  if (ref === null || ref === undefined) return null;
  invariant(typeof ref === 'object' && typeof ref.entryId === 'string' && ref.entryId.trim() && Number.isInteger(ref.version) && ref.version > 0,
    code, 'An MDM reference needs an entryId and a positive version', { ref });
  return Object.freeze({ entryId: ref.entryId.trim(), version: ref.version });
}

// The planned margin is not a free-text opinion: when a placeholder states a retail price and a unit
// cost, the margin follows from them. Storing all three without checking is how a plan silently stops
// meaning anything, so the three are reconciled here and again by a database constraint.
export function plannedMarginBasisPoints(recommendedRetailPriceMinor, plannedUnitCostMinor) {
  if (!recommendedRetailPriceMinor || plannedUnitCostMinor === null || plannedUnitCostMinor === undefined) return null;
  invariant(recommendedRetailPriceMinor > 0, 'PLACEHOLDER_RETAIL_PRICE_INVALID', 'Recommended retail price must be positive to derive a margin');
  return Math.round(((recommendedRetailPriceMinor - plannedUnitCostMinor) / recommendedRetailPriceMinor) * 10000);
}

export function createProductPlaceholder({
  id,
  campaign,
  brandId,
  placeholderCode,
  nameRu,
  nameEn,
  categoryRef = null,
  genderRef = null,
  ageGroupRef = null,
  noveltyRef = null,
  seasonalityRef = null,
  fitRef = null,
  capsule = null,
  drop = null,
  description = null,
  colourwayCount = null,
  plannedQuantity = null,
  launchAt = null,
  currency,
  recommendedRetailPriceMinor = null,
  plannedUnitCostMinor = null,
  createdAt,
  createdBy,
}) {
  invariant(id && campaign?.id, 'PLACEHOLDER_IDENTITY_REQUIRED', 'Placeholder id and campaign are required');
  invariant(campaign.brandId === brandId, 'PLACEHOLDER_BRAND_MISMATCH', 'Placeholder brand must match campaign brand');
  invariant(campaign.status !== 'closed', 'CAMPAIGN_CLOSED', 'Cannot plan a placeholder in a closed campaign');
  invariant(PLACEHOLDER_CODE_PATTERN.test(placeholderCode ?? ''), 'PLACEHOLDER_CODE_INVALID', 'Placeholder code is invalid', { placeholderCode });
  const titleRu = requiredText(nameRu, { code: 'PLACEHOLDER_NAME_REQUIRED', label: 'Placeholder name', max: 200 });
  const titleEn = requiredText(nameEn, { code: 'PLACEHOLDER_NAME_REQUIRED', label: 'Placeholder name', max: 200 });
  invariant(CURRENCY_PATTERN.test(currency ?? ''), 'PLACEHOLDER_CURRENCY_INVALID', 'Placeholder currency must be an ISO-4217 code', { currency });
  invariant(typeof createdBy === 'string' && createdBy.trim(), 'PLACEHOLDER_ACTOR_REQUIRED', 'Placeholder actor is required');
  invariant(typeof createdAt === 'string' && !Number.isNaN(Date.parse(createdAt)), 'PLACEHOLDER_TIMESTAMP_INVALID', 'Placeholder timestamp is invalid');

  const retail = optionalMinor(recommendedRetailPriceMinor, 'PLACEHOLDER_RETAIL_PRICE_INVALID', 'Recommended retail price');
  const cost = optionalMinor(plannedUnitCostMinor, 'PLACEHOLDER_UNIT_COST_INVALID', 'Planned unit cost');
  if (retail !== null && cost !== null) {
    invariant(cost <= retail, 'PLACEHOLDER_MARGIN_NEGATIVE', 'Planned unit cost cannot exceed the recommended retail price', { retail, cost });
  }

  return Object.freeze({
    id,
    campaignId: campaign.id,
    brandId,
    placeholderCode,
    nameRu: titleRu,
    nameEn: titleEn,
    categoryRef: normalizeMdmRef(categoryRef, 'PLACEHOLDER_CATEGORY_REF_INVALID'),
    genderRef: normalizeMdmRef(genderRef, 'PLACEHOLDER_GENDER_REF_INVALID'),
    ageGroupRef: normalizeMdmRef(ageGroupRef, 'PLACEHOLDER_AGE_GROUP_REF_INVALID'),
    noveltyRef: normalizeMdmRef(noveltyRef, 'PLACEHOLDER_NOVELTY_REF_INVALID'),
    seasonalityRef: normalizeMdmRef(seasonalityRef, 'PLACEHOLDER_SEASONALITY_REF_INVALID'),
    fitRef: normalizeMdmRef(fitRef, 'PLACEHOLDER_FIT_REF_INVALID'),
    capsule: capsule ? requiredText(capsule, { code: 'PLACEHOLDER_CAPSULE_INVALID', label: 'Capsule', max: 120 }) : null,
    drop: drop ? requiredText(drop, { code: 'PLACEHOLDER_DROP_INVALID', label: 'Drop', max: 120 }) : null,
    description: description ? String(description).slice(0, 2000) : null,
    colourwayCount: optionalPositiveInteger(colourwayCount, 'PLACEHOLDER_COLOURWAY_COUNT_INVALID', 'Colourway count'),
    plannedQuantity: optionalPositiveInteger(plannedQuantity, 'PLACEHOLDER_PLANNED_QUANTITY_INVALID', 'Planned quantity'),
    launchAt: optionalIsoDate(launchAt, 'PLACEHOLDER_LAUNCH_AT_INVALID', 'Launch date'),
    currency,
    recommendedRetailPriceMinor: retail,
    plannedUnitCostMinor: cost,
    plannedMarginBasisPoints: plannedMarginBasisPoints(retail, cost),
    status: 'planned',
    version: 1,
    createdAt,
    createdBy,
    updatedAt: createdAt,
    updatedBy: createdBy,
  });
}

export function transitionProductPlaceholder(placeholder, nextStatus, { updatedAt, updatedBy, expectedVersion }) {
  invariant(PLACEHOLDER_STATUSES.includes(nextStatus), 'PLACEHOLDER_STATUS_INVALID', 'Unknown placeholder status', { nextStatus });
  invariant(placeholder.version === expectedVersion, 'PLACEHOLDER_VERSION_CONFLICT', 'Placeholder was changed by someone else', {
    expectedVersion, actualVersion: placeholder.version,
  });
  const allowed = placeholderTransitions.get(placeholder.status) ?? new Set();
  invariant(allowed.has(nextStatus), 'PLACEHOLDER_STATUS_TRANSITION_INVALID', 'Placeholder status transition is not allowed', {
    from: placeholder.status, to: nextStatus,
  });
  invariant(typeof updatedBy === 'string' && updatedBy.trim(), 'PLACEHOLDER_ACTOR_REQUIRED', 'Placeholder actor is required');
  return Object.freeze({ ...placeholder, status: nextStatus, version: placeholder.version + 1, updatedAt, updatedBy });
}

// A style is linked to the slot it was developed for. The link is what turns a plan into a
// measurable one: planned quantity and planned cost on one side, the real styles on the other.
export function createPlaceholderStyleLink({ id, placeholder, style, linkedAt, linkedBy }) {
  invariant(id && placeholder?.id && style?.id, 'PLACEHOLDER_STYLE_LINK_IDENTITY_REQUIRED', 'Link id, placeholder and style are required');
  invariant(placeholder.brandId === style.brandId, 'PLACEHOLDER_STYLE_BRAND_MISMATCH', 'Style brand must match placeholder brand');
  invariant(placeholder.status !== 'dropped', 'PLACEHOLDER_DROPPED', 'A dropped placeholder cannot take new styles');
  invariant(typeof linkedBy === 'string' && linkedBy.trim(), 'PLACEHOLDER_ACTOR_REQUIRED', 'Link actor is required');
  invariant(typeof linkedAt === 'string' && !Number.isNaN(Date.parse(linkedAt)), 'PLACEHOLDER_TIMESTAMP_INVALID', 'Link timestamp is invalid');
  return Object.freeze({
    id,
    placeholderId: placeholder.id,
    styleId: style.id,
    brandId: placeholder.brandId,
    campaignId: placeholder.campaignId,
    linkedAt,
    linkedBy,
  });
}
