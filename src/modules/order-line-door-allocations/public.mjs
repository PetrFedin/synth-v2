import { invariant } from '../../core/errors.mjs';

const MAX_INTEGER = 2_147_483_647;

// Распределение одной строки заказа по точкам розницы магазина — операционное намерение, а не
// команда на исполнение. Одна запись на дверь на строку, новая полностью замещает прежнюю.

export function orderLineDoorAllocation({ orderId, lineNo, retailDoorId, quantity, updatedAt, updatedBy }) {
  return Object.freeze({
    orderId: identifier(orderId, 'ORDER_LINE_DOOR_ALLOCATION_ORDER_REQUIRED', 'Order id'),
    lineNo: positiveInteger(lineNo, 'ORDER_LINE_DOOR_ALLOCATION_LINE_NO_INVALID', 'Order line number'),
    retailDoorId: identifier(retailDoorId, 'ORDER_LINE_DOOR_ALLOCATION_DOOR_REQUIRED', 'Retail door'),
    quantity: positiveInteger(quantity, 'ORDER_LINE_DOOR_ALLOCATION_QUANTITY_INVALID', 'Allocated quantity'),
    updatedAt: timestamp(updatedAt, 'ORDER_LINE_DOOR_ALLOCATION_UPDATED_AT_INVALID'),
    updatedBy: identifier(updatedBy, 'ORDER_LINE_DOOR_ALLOCATION_UPDATED_BY_REQUIRED', 'Actor'),
  });
}

// Сумма распределения по строке не может превысить заказанное количество — иначе распределение
// перестаёт отвечать на вопрос «куда уходит эта строка» и начинает придумывать товар.
export function assertAllocationWithinOrderedQuantity(existingAllocations, retailDoorId, quantity, orderedQuantity) {
  const otherDoorsTotal = existingAllocations
    .filter((entry) => entry.retailDoorId !== retailDoorId)
    .reduce((sum, entry) => sum + entry.quantity, 0);
  const total = otherDoorsTotal + quantity;
  invariant(total <= orderedQuantity, 'ORDER_LINE_DOOR_ALLOCATION_EXCEEDS_ORDERED_QUANTITY', 'Door allocations for this line cannot exceed the ordered quantity', {
    orderedQuantity, requestedTotal: total,
  });
}

function identifier(value, code, label) { const normalized = typeof value === 'string' ? value.trim() : ''; invariant(normalized.length >= 1 && normalized.length <= 200, code, `${label} must contain 1 to 200 characters`); return normalized; }
function positiveInteger(value, code, label) { invariant(Number.isInteger(value) && value >= 1 && value <= MAX_INTEGER, code, `${label} must be a positive integer`); return value; }
function timestamp(value, code) { const parsed = Date.parse(value); invariant(typeof value === 'string' && Number.isFinite(parsed), code, 'Timestamp must be a valid ISO date-time'); return new Date(parsed).toISOString(); }
