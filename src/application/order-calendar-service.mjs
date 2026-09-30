import { domainEvent } from '../core/events.mjs';
import { invariant } from '../core/errors.mjs';
import { canonicalJson, fingerprintsMatch } from '../core/fingerprints.mjs';
import { CAPABILITIES, assertCapability, roleHasCapability } from '../modules/access-control/public.mjs';
import { createCalendarMilestone, createCalendarMilestoneTemplate } from '../modules/calendar/public.mjs';

const DAY_MS = 86_400_000;

/**
 * Календарные вехи заказа — общая на обе стороны сделки таймлиния поверх уже существующей
 * `calendar_milestones`, которая до сих пор писала только вехи открытия сделки.
 *
 * `visibility` решает, кто видит веху: `private` — только организация, что её завела, `shared` —
 * обе стороны заказа. Поле уже существовало в домене, но ни один читатель его не спрашивал; здесь
 * оно наконец действует.
 *
 * @param {{ store?: any, clock?: () => string, nextId?: (prefix: string) => string }} [options]
 */
export function createOrderCalendarService({ store, clock = () => new Date().toISOString(), nextId = defaultIdGenerator() } = {}) {
  invariant(store && typeof store.transaction === 'function', 'ORDER_CALENDAR_STORE_REQUIRED', 'Order calendar store is required');

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

  return Object.freeze({
    addOrderCalendarMilestone(commandId, actorId, orderId, input) {
      const fingerprint = `orderCalendarMilestone.add:${actorId}:${orderId}:${canonicalJson(input ?? null)}`;
      return execute(
        commandId,
        fingerprint,
        actorId,
        async (tx) => {
          const order = await loadOrder(tx, orderId);
          const brandMembership = await tx.getMembership(order.brandId, actorId);
          const shopMembership = await tx.getMembership(order.shopId, actorId);
          // Веху заводит та сторона, за которую пишет актёр, а не тело запроса — иначе бренд мог бы
          // завести веху от имени магазина, а это уже не заметка о своём заказе, а подмена автора.
          let ownerOrganisationId;
          if (brandMembership?.status === 'active' && roleHasCapability(brandMembership.role, CAPABILITIES.ORDER_WRITE)) ownerOrganisationId = order.brandId;
          else if (shopMembership?.status === 'active' && roleHasCapability(shopMembership.role, CAPABILITIES.ORDER_WRITE)) ownerOrganisationId = order.shopId;
          else assertCapability(brandMembership ?? shopMembership, CAPABILITIES.ORDER_WRITE);
          return Object.freeze({ order, ownerOrganisationId });
        },
        async (tx, { order, ownerOrganisationId }) => {
          const milestone = createCalendarMilestone({
            id: nextId('calendar-milestone'),
            ownerOrganisationId,
            cycleId: order.cycleId,
            type: 'order',
            title: input?.title,
            startsAt: input?.startsAt,
            visibility: input?.visibility ?? 'private',
          });
          await tx.insertCalendarMilestone(milestone);
          await append(tx, 'order.calendar-milestone-added', order.id, {
            milestoneId: milestone.id, title: milestone.title, startsAt: milestone.startsAt, visibility: milestone.visibility,
          }, commandId, actorId);
          return milestone;
        },
      );
    },

    getOrderCalendarMilestonesForActor(actorId, orderId) {
      return store.transaction(async (tx) => {
        const order = await loadOrder(tx, orderId);
        const brandMembership = await tx.getMembership(order.brandId, actorId);
        const shopMembership = await tx.getMembership(order.shopId, actorId);
        assertCapability(brandMembership ?? shopMembership, CAPABILITIES.LOGISTICS_READ);
        const ownOrganisationId = brandMembership?.status === 'active' && roleHasCapability(brandMembership.role, CAPABILITIES.LOGISTICS_READ)
          ? order.brandId
          : order.shopId;
        const milestones = await tx.listCalendarMilestonesByCycle(order.cycleId);
        const visible = milestones.filter((milestone) => milestone.ownerOrganisationId === ownOrganisationId || milestone.visibility === 'shared');
        return Object.freeze({ orderId: order.id, milestones: Object.freeze(visible) });
      });
    },

    // Заведение вех одной за другой держало календарь пустым дольше, чем должно было: сторона,
    // знающая свой типовой набор («Заказ подтверждён +0д», «Груз готов +60д», …), каждый раз
    // набирала его заново. Шаблон — набор строк со смещением в днях от даты-якоря; применение
    // проходит ровно через тот же `createCalendarMilestone`, каким уже заводится одиночная веха,
    // просто в цикле внутри одной команды.
    createCalendarTemplate(commandId, actorId, organisationId, input) {
      const fingerprint = `calendarTemplate.create:${actorId}:${organisationId}:${canonicalJson(input ?? null)}`;
      return execute(
        commandId,
        fingerprint,
        actorId,
        async (tx) => {
          const membership = await tx.getMembership(organisationId, actorId);
          assertCapability(membership, CAPABILITIES.ORDER_WRITE);
          return Object.freeze({});
        },
        async (tx) => {
          const template = createCalendarMilestoneTemplate({
            id: nextId('calendar-template'),
            organisationId,
            name: input?.name,
            lines: input?.lines,
            createdAt: clock(),
            createdBy: actorId,
          });
          await tx.insertCalendarTemplate(template);
          return template;
        },
      );
    },

    listCalendarTemplatesForActor(actorId, organisationId) {
      return store.transaction(async (tx) => {
        const membership = await tx.getMembership(organisationId, actorId);
        assertCapability(membership, CAPABILITIES.LOGISTICS_READ);
        const templates = await tx.listCalendarTemplatesByOrganisation(organisationId);
        return Object.freeze({ organisationId, templates: Object.freeze(templates) });
      });
    },

    applyCalendarTemplateToOrder(commandId, actorId, orderId, input) {
      const fingerprint = `calendarTemplate.apply:${actorId}:${orderId}:${canonicalJson(input ?? null)}`;
      return execute(
        commandId,
        fingerprint,
        actorId,
        async (tx) => {
          const order = await loadOrder(tx, orderId);
          const brandMembership = await tx.getMembership(order.brandId, actorId);
          const shopMembership = await tx.getMembership(order.shopId, actorId);
          let ownerOrganisationId;
          if (brandMembership?.status === 'active' && roleHasCapability(brandMembership.role, CAPABILITIES.ORDER_WRITE)) ownerOrganisationId = order.brandId;
          else if (shopMembership?.status === 'active' && roleHasCapability(shopMembership.role, CAPABILITIES.ORDER_WRITE)) ownerOrganisationId = order.shopId;
          else assertCapability(brandMembership ?? shopMembership, CAPABILITIES.ORDER_WRITE);
          const template = await tx.getCalendarTemplate(input?.templateId);
          invariant(template, 'CALENDAR_TEMPLATE_NOT_FOUND', 'Calendar template not found', { templateId: input?.templateId });
          // A template applies only within the organisation that owns it: reading someone else's
          // template by id and running it against your own side of the deal would apply vehicles
          // whose visibility/type were authored for a different organisation's own practice.
          invariant(template.organisationId === ownerOrganisationId, 'CALENDAR_TEMPLATE_ORGANISATION_MISMATCH', 'Calendar template belongs to a different organisation', { templateId: template.id });
          invariant(typeof input?.anchorAt === 'string' && Number.isFinite(Date.parse(input.anchorAt)), 'CALENDAR_TEMPLATE_ANCHOR_INVALID', 'Anchor date is invalid');
          return Object.freeze({ order, ownerOrganisationId, template, anchorAt: input.anchorAt });
        },
        async (tx, { order, ownerOrganisationId, template, anchorAt }) => {
          const anchorMs = Date.parse(anchorAt);
          const milestones = [];
          for (const line of template.lines) {
            const milestone = createCalendarMilestone({
              id: nextId('calendar-milestone'),
              ownerOrganisationId,
              cycleId: order.cycleId,
              type: line.type,
              title: line.title,
              startsAt: new Date(anchorMs + line.offsetDays * DAY_MS).toISOString(),
              visibility: line.visibility,
            });
            await tx.insertCalendarMilestone(milestone);
            milestones.push(milestone);
          }
          await append(tx, 'order.calendar-template-applied', order.id, {
            templateId: template.id, milestoneIds: milestones.map((milestone) => milestone.id),
          }, commandId, actorId);
          return Object.freeze({ orderId: order.id, milestones: Object.freeze(milestones) });
        },
      );
    },
  });
}

function defaultIdGenerator() { let sequence = 0; return (prefix) => `${prefix}_${++sequence}`; }
