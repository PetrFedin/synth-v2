import { domainEvent } from '../core/events.mjs';
import { invariant } from '../core/errors.mjs';
import { canonicalJson, fingerprintsMatch } from '../core/fingerprints.mjs';
import { CAPABILITIES, assertCapability, roleHasCapability } from '../modules/access-control/public.mjs';
import { orderLineComment } from '../modules/order-line-comments/public.mjs';

/**
 * Комментарий поставщика и комментарий заказчика на строке заказа.
 *
 * Сторону, от чьего имени пишется комментарий, определяет сервис по членству актёра в
 * brand_id/shop_id заказа — не тело запроса: иначе бренд мог бы написать «от заказчика», а это уже
 * не заметка при сделке, а подмена того, кто её сделал.
 *
 * @param {{ store?: any, clock?: () => string, nextId?: (prefix: string) => string }} [options]
 */
export function createOrderLineCommentService({ store, clock = () => new Date().toISOString(), nextId = defaultIdGenerator() } = {}) {
  invariant(store && typeof store.transaction === 'function', 'ORDER_LINE_COMMENT_STORE_REQUIRED', 'Order line comment store is required');

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

  async function append(tx, type, orderId, payload, commandId, actorId) {
    await tx.appendOutbox(domainEvent({
      id: nextId('event'), type, aggregateId: orderId, occurredAt: clock(), payload, metadata: { commandId, actorId },
    }));
  }

  async function loadOrder(tx, orderId) {
    const order = await tx.getOrder(orderId);
    invariant(order, 'ORDER_NOT_FOUND', 'Order not found', { orderId });
    return order;
  }

  // Обе стороны сделки несут order.write — продажи бренда и байер магазина. Сторона комментария
  // определяется тем, в какой из двух организаций заказа состоит актёр, а не выбором в запросе.
  async function resolveSide(tx, order, actorId) {
    const brandMembership = await tx.getMembership(order.brandId, actorId);
    if (brandMembership?.status === 'active' && roleHasCapability(brandMembership.role, CAPABILITIES.ORDER_WRITE)) return 'supplier';
    const shopMembership = await tx.getMembership(order.shopId, actorId);
    if (shopMembership?.status === 'active' && roleHasCapability(shopMembership.role, CAPABILITIES.ORDER_WRITE)) return 'customer';
    assertCapability(brandMembership ?? shopMembership, CAPABILITIES.ORDER_WRITE);
  }

  return Object.freeze({
    setOrderLineComment(commandId, actorId, orderId, input) {
      const lineNo = input?.lineNo;
      const body = input?.body;
      const fingerprint = `orderLineComment.set:${actorId}:${orderId}:${lineNo}:${canonicalJson(body ?? null)}`;
      return execute(
        commandId,
        fingerprint,
        actorId,
        async (tx) => {
          const order = await loadOrder(tx, orderId);
          invariant(Number.isInteger(lineNo) && lineNo >= 1 && lineNo <= order.lines.length, 'ORDER_LINE_COMMENT_LINE_NOT_FOUND', 'Order does not have that line', { orderId, lineNo, lineCount: order.lines.length });
          const side = await resolveSide(tx, order, actorId);
          return Object.freeze({ orderId: order.id, side });
        },
        async (tx, { orderId: resolvedOrderId, side }) => {
          const trimmed = typeof body === 'string' ? body.trim() : '';
          if (!trimmed) {
            await tx.deleteOrderLineComment({ orderId: resolvedOrderId, lineNo, side });
            await append(tx, 'order.line-comment-cleared', resolvedOrderId, { lineNo, side }, commandId, actorId);
            return Object.freeze({ orderId: resolvedOrderId, lineNo, side, body: null });
          }
          const comment = orderLineComment({ orderId: resolvedOrderId, lineNo, side, body: trimmed, commentedAt: clock(), commentedBy: actorId });
          await tx.upsertOrderLineComment(comment);
          await append(tx, 'order.line-comment-set', resolvedOrderId, { lineNo, side, body: comment.body }, commandId, actorId);
          return comment;
        },
      );
    },

    getOrderLineCommentsForActor(actorId, orderId) {
      return store.transaction(async (tx) => {
        const order = await loadOrder(tx, orderId);
        const brandMembership = await tx.getMembership(order.brandId, actorId);
        const shopMembership = await tx.getMembership(order.shopId, actorId);
        assertCapability(brandMembership ?? shopMembership, CAPABILITIES.LOGISTICS_READ);
        const comments = await tx.listOrderLineComments(order.id);
        return Object.freeze({ orderId: order.id, comments: Object.freeze(comments) });
      });
    },
  });
}

function defaultIdGenerator() { let sequence = 0; return (prefix) => `${prefix}_${++sequence}`; }
