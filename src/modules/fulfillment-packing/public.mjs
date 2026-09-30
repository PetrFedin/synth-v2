import { invariant } from '../../core/errors.mjs';

// Упаковочный статус плана отгрузки: предвестник отгрузки, а не факт её исполнения. Не входит в
// неизменяемый снимок `fulfillment_plan_snapshots` (см. `src/modules/fulfillment/public.mjs`) —
// отдельная маленькая изменяемая запись, ключ — план.

export const PACKING_STATUSES = Object.freeze(['packing', 'packed']);

const FORWARD_TRANSITIONS = new Map([
  [null, new Set(['packing'])],
  ['packing', new Set(['packed'])],
  ['packed', new Set()],
]);

export function advancePackingStatus({ fulfillmentPlanId, brandId, currentStatus, nextStatus, actorId, updatedAt }) {
  invariant(PACKING_STATUSES.includes(nextStatus), 'FULFILLMENT_PACKING_STATUS_INVALID', 'Packing status is invalid', { nextStatus });
  const allowed = FORWARD_TRANSITIONS.get(currentStatus ?? null);
  invariant(allowed?.has(nextStatus), 'FULFILLMENT_PACKING_TRANSITION_INVALID', 'Packing status can only move forward: none → packing → packed', { from: currentStatus ?? null, to: nextStatus });
  return Object.freeze({
    fulfillmentPlanId: identifier(fulfillmentPlanId, 'FULFILLMENT_PACKING_PLAN_REQUIRED', 'Fulfillment plan'),
    brandId: identifier(brandId, 'FULFILLMENT_PACKING_BRAND_REQUIRED', 'Brand'),
    status: nextStatus,
    updatedAt: timestamp(updatedAt, 'FULFILLMENT_PACKING_UPDATED_AT_INVALID'),
    updatedBy: identifier(actorId, 'FULFILLMENT_PACKING_UPDATED_BY_REQUIRED', 'Actor'),
  });
}

function identifier(value, code, label) { const normalized = typeof value === 'string' ? value.trim() : ''; invariant(normalized.length >= 1 && normalized.length <= 200, code, `${label} must contain 1 to 200 characters`); return normalized; }
function timestamp(value, code) { const parsed = Date.parse(value); invariant(typeof value === 'string' && Number.isFinite(parsed), code, 'Timestamp must be a valid ISO date-time'); return new Date(parsed).toISOString(); }
