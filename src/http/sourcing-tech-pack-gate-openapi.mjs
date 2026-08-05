export function withSourcingTechPackGateOpenApi(base) {
  const specification = structuredClone(base);
  specification.info.version = '1.14.0';
  const allocation = specification.components.schemas.RfqAllocation;
  allocation.required.push(
    'techPackCode',
    'techPackRevision',
    'techPackVersion',
    'techPackIssuedVersion',
    'techPackAcknowledgedAt',
    'techPackAcknowledgementReference',
  );
  Object.assign(allocation.properties, {
    techPackCode: { type: 'string', pattern: '^[A-Z0-9][A-Z0-9._/-]{2,63}$' },
    techPackRevision: { type: 'integer', minimum: 1, maximum: 999 },
    techPackVersion: { type: 'integer', minimum: 2, maximum: 2147483647 },
    techPackIssuedVersion: { type: 'integer', minimum: 1, maximum: 2147483646 },
    techPackAcknowledgedAt: { type: 'string', format: 'date-time' },
    techPackAcknowledgementReference: { type: 'string', minLength: 2, maxLength: 160 },
  });
  const operation = specification.paths['/rfqs/{rfqCode}/allocate'].post;
  operation.description = 'Allocates the complete awarded quantity only after the selected supplier acknowledged the current Tech Pack revision. The server resolves and snapshots the acknowledged Tech Pack; clients cannot submit or override snapshot fields.';
  operation['x-syntha-production-gate'] = 'supplier-acknowledged-current-tech-pack';
  return deepFreeze(specification);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value)) deepFreeze(nested);
  return value;
}
