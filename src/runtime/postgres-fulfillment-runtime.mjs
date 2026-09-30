import { invariant } from '../core/errors.mjs';
import { createFulfillmentService } from '../application/fulfillment-service.mjs';
import { createPhysicalActualCostService } from '../application/physical-actual-cost-service.mjs';
import { createOrderFulfillmentViewService } from '../application/order-fulfillment-view-service.mjs';
import { createOrderLineCommentService } from '../application/order-line-comment-service.mjs';
import { createOrderLineDoorAllocationService } from '../application/order-line-door-allocation-service.mjs';
import { createOrderCalendarService } from '../application/order-calendar-service.mjs';
import { createPostgresFulfillmentStore } from '../infrastructure/postgres-fulfillment-store.mjs';
import { createPostgresOrderFulfillmentReader } from '../infrastructure/postgres-order-fulfillment-reader.mjs';
import { resolveRuntimeIdGenerator } from './id-generator.mjs';

export function createPostgresFulfillmentRuntime({ pool, clock, nextId } = {}) {
  invariant(pool, 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  const store = createPostgresFulfillmentStore({ pool });
  const resolvedNextId = resolveRuntimeIdGenerator(nextId);
  const service = Object.freeze({
    ...createFulfillmentService({
      store,
      nextId: resolvedNextId,
      ...(clock ? { clock } : {}),
    }),
    ...createPhysicalActualCostService({
      store,
      nextId: resolvedNextId,
      ...(clock ? { clock } : {}),
    }),
    // Чтение хвоста целиком: отдельная служба, потому что это вопрос «что уже случилось», а не
    // «что сделать дальше», и права у него свои — видеть цепочку вправе обе стороны сделки.
    ...createOrderFulfillmentViewService({ store, reader: createPostgresOrderFulfillmentReader({ pool }) }),
    // Заметка при сделке, не о её исполнении — тот же store (getOrder/getMembership уже есть),
    // потому что комментарий про заказ, а не про отгрузку, но отдельный сервис: право и форма
    // записи у него свои.
    ...createOrderLineCommentService({ store, nextId: resolvedNextId, ...(clock ? { clock } : {}) }),
    // Распределение по своим дверям — тоже про заказ, не про его исполнение: тот же store, свой
    // сервис, потому что пишет только магазин, а не обе стороны.
    ...createOrderLineDoorAllocationService({ store, nextId: resolvedNextId, ...(clock ? { clock } : {}) }),
    // Вехи заказа — тоже общий store: писать вправе любая из сторон сделки за саму себя, читает
    // каждая сторона свои вехи плюс то, что другая сторона отметила как общее.
    ...createOrderCalendarService({ store, nextId: resolvedNextId, ...(clock ? { clock } : {}) }),
  });
  return Object.freeze({ store, service });
}
