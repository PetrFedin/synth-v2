import { invariant } from '../../core/errors.mjs';

export function openDealSpace({ id, cycle, createdAt }) {
  invariant(cycle.stage === 'confirmation', 'CONFIRMATION_STAGE_REQUIRED', 'DealSpace opens only after confirmation');
  invariant(cycle.order, 'DEAL_ORDER_REQUIRED', 'DealSpace requires a confirmed order');
  return Object.freeze({
    id,
    cycleId: cycle.id,
    brandId: cycle.brandId,
    shopId: cycle.shopId,
    orderId: cycle.order.id,
    status: 'open',
    totalAmount: cycle.order.totalAmount,
    currency: cycle.order.currency,
    createdAt,
  });
}
