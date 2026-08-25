import { randomUUID } from 'node:crypto';
import { domainEvent } from '../core/events.mjs';
import { invariant } from '../core/errors.mjs';
import { canonicalJson, fingerprintsMatch } from '../core/fingerprints.mjs';
import { CAPABILITIES, assertCapability } from '../modules/access-control/public.mjs';
import { productionRequirementLine } from '../modules/order-economics/production-requirement.mjs';
import { createRfqFromProductionRequirement as createRfqFromProductionRequirementDomain } from '../modules/sourcing/production-requirement-rfq.mjs';

const INPUT_FIELDS = new Set([
  'rfqCode',
  'productionRequirementSnapshotId',
  'orderLineNo',
  'responseDueAt',
  'deliveryDueAt',
  'incoterm',
  'supplierCodes',
  'notes',
]);

export function createProductionSourcingService({
  store,
  clock = () => new Date().toISOString(),
  nextId = defaultIdGenerator(),
} = {}) {
  invariant(store && typeof store.transaction === 'function', 'PRODUCTION_SOURCING_STORE_REQUIRED', 'Production sourcing store is required');

  function execute(commandId, fingerprint, actorId, prepare, action) {
    invariant(typeof commandId === 'string' && commandId.trim().length > 0, 'COMMAND_ID_REQUIRED', 'Every mutation requires commandId');
    invariant(typeof actorId === 'string' && actorId.trim().length > 0, 'ACTOR_ID_REQUIRED', 'Production sourcing mutation requires actor id');
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

  return Object.freeze({
    createRfqFromProductionRequirement(commandId, actorId, input) {
      assertInput(input);
      const fingerprint = `createProductionRfq:${actorId}:${canonicalJson(input)}`;
      return execute(
        commandId,
        fingerprint,
        actorId,
        async (tx) => {
          const requirement = requireEntity(
            await tx.getProductionRequirement(input.productionRequirementSnapshotId),
            'PRODUCTION_REQUIREMENT_NOT_FOUND',
            { productionRequirementSnapshotId: input.productionRequirementSnapshotId },
          );
          const membership = await tx.getMembership(requirement.brandId, actorId);
          assertCapability(membership, CAPABILITIES.SOURCING_MANAGE);
          invariant(membership.organisationType === 'brand', 'PRODUCTION_RFQ_BRAND_MEMBERSHIP_REQUIRED', 'Production RFQ release requires a brand membership', { brandId: requirement.brandId, actorId });
          const line = productionRequirementLine(requirement, input.orderLineNo);
          const existing = await tx.getActiveRfqByProductionRequirementLine(requirement.id, line.orderLineNo);
          const productSku = requireEntity(await tx.getProductSku(line.productSkuId), 'PRODUCT_SKU_NOT_FOUND', { productSkuId: line.productSkuId });
          const catalogSku = requireEntity(await tx.getCatalogSku(line.sku), 'SKU_NOT_FOUND', { sku: line.sku });
          const bom = requireEntity(await tx.getBomByProductSku(line.productSkuId), 'BOM_NOT_FOUND', { productSkuId: line.productSkuId, sku: line.sku });
          const suppliers = await tx.getSuppliersByCodes(input.supplierCodes);
          return Object.freeze({ requirement, line, existing, productSku, catalogSku, bom, suppliers });
        },
        async (tx, context) => {
          invariant(!context.existing, 'PRODUCTION_RFQ_ACTIVE_EXISTS', 'An active RFQ already covers this immutable production requirement line', {
            productionRequirementSnapshotId: context.requirement.id,
            orderLineNo: context.line.orderLineNo,
            rfqCode: context.existing?.rfqCode ?? null,
          });
          const rfq = createRfqFromProductionRequirementDomain({
            id: nextId('rfq'),
            productionRequirement: context.requirement,
            requirementLine: context.line,
            productSku: context.productSku,
            catalogSku: context.catalogSku,
            bom: context.bom,
            suppliers: context.suppliers,
            input,
            createdAt: clock(),
          });
          await tx.insertRfq(rfq);
          await tx.appendOutbox(domainEvent({
            id: nextId('event'),
            type: 'sourcing.rfq-created-from-production-requirement',
            aggregateId: rfq.id,
            occurredAt: clock(),
            payload: {
              rfqCode: rfq.rfqCode,
              brandId: rfq.brandId,
              productionRequirementSnapshotId: rfq.productionRequirementSnapshotId,
              productionRequirementOrderLineNo: rfq.productionRequirementOrderLineNo,
              productSkuId: rfq.productSkuId,
              styleVersionId: rfq.styleVersionId,
              colorwayId: rfq.colorwayId,
              sizeValueId: rfq.sizeValueId,
              targetQuantity: rfq.targetQuantity,
              status: rfq.status,
            },
            metadata: { commandId, actorId },
          }));
          return rfq;
        },
      );
    },
  });
}

function assertInput(input) {
  invariant(input && typeof input === 'object' && !Array.isArray(input), 'PRODUCTION_RFQ_INPUT_INVALID', 'Production RFQ input is invalid');
  const forbidden = Object.keys(input).filter((field) => !INPUT_FIELDS.has(field)).sort();
  invariant(forbidden.length === 0, 'PRODUCTION_RFQ_FIELD_FORBIDDEN', 'Production RFQ input contains fields that must be derived server-side', { fields: forbidden });
  for (const field of ['rfqCode', 'productionRequirementSnapshotId', 'orderLineNo', 'responseDueAt', 'deliveryDueAt', 'incoterm', 'supplierCodes', 'notes']) {
    invariant(Object.hasOwn(input, field), 'PRODUCTION_RFQ_FIELD_REQUIRED', 'Production RFQ input is missing required fields', { field });
  }
  invariant(typeof input.productionRequirementSnapshotId === 'string' && input.productionRequirementSnapshotId.length > 0, 'PRODUCTION_REQUIREMENT_ID_REQUIRED', 'Production requirement snapshot id is required');
  invariant(Number.isInteger(input.orderLineNo) && input.orderLineNo > 0, 'PRODUCTION_REQUIREMENT_ORDER_LINE_NO_INVALID', 'Production requirement order line number must be a positive integer');
  invariant(Array.isArray(input.supplierCodes) && input.supplierCodes.length > 0, 'PRODUCTION_RFQ_SUPPLIERS_REQUIRED', 'At least one supplier is required');
}
function requireEntity(value, code, details) {
  invariant(value, code, 'Entity not found', details);
  return value;
}
function defaultIdGenerator() {
  return (prefix) => `${prefix}_${randomUUID()}`;
}
