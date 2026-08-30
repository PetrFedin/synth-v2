const SAFE_ID = '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$';
const identifier = { type: 'string', minLength: 1, maxLength: 200, pattern: SAFE_ID };
const nullableIdentifier = { oneOf: [identifier, { type: 'null' }] };
const sha256 = { type: 'string', pattern: '^[a-f0-9]{64}$' };
const nullableSha256 = { oneOf: [sha256, { type: 'null' }] };
const allocationStatus = { type: 'string', enum: ['current', 'legacy-not-applicable', 'pending-post-close'] };
const nullableLineageMode = { oneOf: [{ type: 'string', enum: ['product-sku-v2'] }, { type: 'null' }] };

export function withEcon003AllocationMarginOpenApi(base) {
  const specification = structuredClone(base);
  const schemas = specification.components?.schemas ?? {};

  addProperties(schemas.MarginActualizationInput, {
    costAllocationRunSnapshotId: identifier,
  });
  addProperties(schemas.MarginActualizationSnapshot, allocationSnapshotProperties());
  addProperties(schemas.CostCloseReadinessSnapshot, allocationSnapshotProperties());
  addProperties(schemas.CostCloseSnapshot, allocationSnapshotProperties());
  addProperties(schemas.PostCloseAdjustment, {
    aggregateContentHash: sha256,
    previousAllocationStatus: { oneOf: [allocationStatus, { type: 'null' }] },
    resultingAllocationStatus: allocationStatus,
    closedCostAllocationRunSnapshotId: nullableIdentifier,
    closedCostAllocationRunContentHash: nullableSha256,
  });

  return deepFreeze(specification);
}

function allocationSnapshotProperties() {
  return {
    aggregateContentHash: sha256,
    allocationStatus,
    costAllocationRunSnapshotId: nullableIdentifier,
    costAllocationRunContentHash: nullableSha256,
    costAllocationPolicyVersionId: nullableIdentifier,
    costAllocationLineageMode: nullableLineageMode,
  };
}

function addProperties(schema, properties) {
  if (!schema || schema.type !== 'object') return;
  schema.properties = { ...(schema.properties ?? {}), ...properties };
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value)) deepFreeze(nested);
  return value;
}
