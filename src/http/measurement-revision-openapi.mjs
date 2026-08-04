export function withMeasurementRevisionOpenApi(base) {
  const specification = structuredClone(base);
  specification.info.version = '1.10.1';
  const update = specification.paths?.['/measurements/{sku}']?.patch;
  if (!update) throw new Error('Measurement update OpenAPI operation is missing');
  update.description = 'Updates an existing draft. If the current chart is published, the server atomically archives that immutable published snapshot and opens the supplied content as the next draft revision.';
  update['x-syntha-published-transition'] = 'archive-published-snapshot-and-open-draft-revision';
  specification.components.schemas.MeasurementChartUpdate.description = 'Complete editable Measurement Chart content plus optimistic expectedVersion. On a published chart this starts a governed draft revision without mutating the archived publication.';
  return deepFreeze(specification);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value)) deepFreeze(nested);
  return value;
}
