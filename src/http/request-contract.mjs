import { invariant } from '../core/errors.mjs';

export function bodyContract(allowedFields = [], nested = {}, arrayItems = {}) {
  return Object.freeze({
    allowedFields: Object.freeze([...allowedFields]),
    nested: Object.freeze(Object.fromEntries(Object.entries(nested).map(([key, fields]) => [key, Object.freeze([...fields])]))),
    arrayItems: Object.freeze(Object.fromEntries(Object.entries(arrayItems).map(([key, fields]) => [key, Object.freeze([...fields])]))),
  });
}

export function assertBodyContract(body, contract = bodyContract()) {
  assertObject(body, 'HTTP_JSON_OBJECT_REQUIRED', 'Request body must be a JSON object');
  assertAllowedFields(body, contract.allowedFields, 'HTTP_BODY_FIELD_UNKNOWN', 'Request body');
  for (const [field, allowedFields] of Object.entries(contract.nested)) {
    if (body[field] === undefined) continue;
    assertObject(body[field], 'HTTP_BODY_FIELD_INVALID', `${field} must be a JSON object`, { field });
    assertAllowedFields(body[field], allowedFields, 'HTTP_BODY_FIELD_UNKNOWN', field, { field });
  }
  for (const [field, allowedFields] of Object.entries(contract.arrayItems ?? {})) {
    if (body[field] === undefined) continue;
    invariant(Array.isArray(body[field]), 'HTTP_BODY_FIELD_INVALID', `${field} must be a JSON array`, { field });
    body[field].forEach((item, index) => {
      assertObject(item, 'HTTP_BODY_FIELD_INVALID', `${field}[${index}] must be a JSON object`, { field, index });
      assertAllowedFields(item, allowedFields, 'HTTP_BODY_FIELD_UNKNOWN', `${field}[${index}]`, { field, index });
    });
  }
  return body;
}

export function assertQueryContract(query, allowedFields = []) {
  assertObject(query, 'HTTP_QUERY_INVALID', 'Query parameters must be an object');
  assertAllowedFields(query, allowedFields, 'HTTP_QUERY_FIELD_UNKNOWN', 'Query parameters');
  return query;
}

function assertAllowedFields(value, allowedFields, code, label, details = {}) {
  const allowed = new Set(allowedFields);
  const unknownFields = Object.keys(value).filter((field) => !allowed.has(field)).sort();
  invariant(unknownFields.length === 0, code, `${label} contains unsupported fields`, {
    ...details,
    unknownFields,
    allowedFields: [...allowed].sort(),
  });
}

function assertObject(value, code, message, details = {}) {
  invariant(value !== null && typeof value === 'object' && !Array.isArray(value), code, message, details);
}
