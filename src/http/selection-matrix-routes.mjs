import { invariant } from '../core/errors.mjs';
import { assertBodyContract, assertQueryContract, bodyContract } from './request-contract.mjs';

const MATRIX_BODY = bodyContract(['selectionId', 'lines'], {}, { lines: ['sku', 'quantity', 'note'] });
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const SKU = /^[A-Z0-9][A-Z0-9._-]{1,63}$/;
const MAX_LINES = 5_000;
const MAX_QUANTITY = 2_147_483_647;
const MAX_NOTE = 2_000;

export function createSelectionMatrixRoutes({ collaboration } = {}) {
  const service = collaboration ?? unavailableSelectionMatrix();
  return Object.freeze([
    Object.freeze({
      method: 'PUT',
      pattern: /^\/v2\/selections\/([^/]+)\/matrix$/,
      mutation: true,
      execute(context) {
        assertQueryContract(context.query ?? {}, []);
        validateMatrixBody(context.body, context.params[0]);
        return service.replaceSelectionMatrix(context.commandId, context.actorId, context.params[0], context.body);
      },
    }),
  ]);
}

function validateMatrixBody(body, selectionId) {
  assertBodyContract(body, MATRIX_BODY);
  invariant(typeof selectionId === 'string' && SAFE_ID.test(selectionId), 'HTTP_PATH_PARAMETER_INVALID', 'selectionId must be a valid identifier', { field: 'selectionId' });
  invariant(typeof body.selectionId === 'string' && body.selectionId === selectionId, 'HTTP_IDENTIFIER_MISMATCH', 'selectionId in request body must match the route', { field: 'selectionId' });
  invariant(Array.isArray(body.lines), 'HTTP_BODY_FIELD_INVALID', 'lines must be a JSON array', { field: 'lines' });
  invariant(body.lines.length <= MAX_LINES, 'HTTP_BODY_FIELD_INVALID', `lines must not exceed ${MAX_LINES} records`, { field: 'lines', maxItems: MAX_LINES });
  const seen = new Set();
  body.lines.forEach((line, index) => {
    invariant(line && typeof line === 'object' && !Array.isArray(line), 'HTTP_BODY_FIELD_INVALID', `lines[${index}] must be an object`, { field: 'lines', index });
    invariant(typeof line.sku === 'string' && SKU.test(line.sku), 'HTTP_BODY_FIELD_INVALID', `lines[${index}].sku must be a canonical Product Identity SKU code`, { field: 'lines.sku', index });
    invariant(!seen.has(line.sku), 'HTTP_BODY_FIELD_INVALID', `lines[${index}].sku is duplicated`, { field: 'lines.sku', index, sku: line.sku });
    seen.add(line.sku);
    invariant(Number.isSafeInteger(line.quantity) && line.quantity >= 1 && line.quantity <= MAX_QUANTITY, 'HTTP_BODY_FIELD_INVALID', `lines[${index}].quantity must be a positive PostgreSQL integer`, { field: 'lines.quantity', index });
    invariant(line.note === undefined || (typeof line.note === 'string' && line.note.length <= MAX_NOTE), 'HTTP_BODY_FIELD_INVALID', `lines[${index}].note must not exceed ${MAX_NOTE} characters`, { field: 'lines.note', index });
  });
}

function unavailableSelectionMatrix() {
  return Object.freeze({ replaceSelectionMatrix: () => invariant(false, 'SELECTION_MATRIX_SERVICE_REQUIRED', 'Selection matrix service is required') });
}
