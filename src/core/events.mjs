export function domainEvent({ id, type, aggregateId, occurredAt, payload = {}, metadata = {} }) {
  return Object.freeze({
    id,
    type,
    aggregateId,
    occurredAt,
    payload: Object.freeze({ ...payload }),
    metadata: Object.freeze({ ...metadata }),
  });
}
