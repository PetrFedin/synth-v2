import test from 'node:test';
import assert from 'node:assert/strict';
import { DomainError } from '../src/core/errors.mjs';
import { isServerFaultCode, normalizeHttpError } from '../src/http/error-status.mjs';
import { createWholesaleFetchHandler } from '../src/http/fetch-api.mjs';

function options(workspaceImpl) {
  return {
    authenticate: async (token) => (token === 'valid-token' ? { actorId: 'user-1' } : null),
    auth: { login: async () => ({ ok: true }), logout: async () => true },
    platform: {}, partners: {}, collaboration: {}, orders: {}, notifications: {},
    workspace: workspaceImpl,
    nextRequestId: () => 'request-1',
  };
}

test('a reader that breaks its contract is a server fault, not a bad request', async () => {
  const handler = createWholesaleFetchHandler(options({
    async loadForActor() { throw new DomainError('WORKSPACE_PAGE_RESULT_INVALID', 'Workspace page items are invalid', { limit: 25 }); },
  }));

  const response = await handler(new Request('https://syntha.test/v2/workspace', { headers: { authorization: 'Bearer valid-token' } }));
  const payload = await response.json();

  assert.equal(response.status, 500);
  assert.equal(payload.error.code, 'WORKSPACE_PAGE_RESULT_INVALID');
});

test('client input errors keep their existing statuses', async () => {
  const handler = createWholesaleFetchHandler(options({
    async loadForActor() { throw new DomainError('WORKSPACE_LIMIT_INVALID', 'Workspace limit is invalid'); },
  }));

  const response = await handler(new Request('https://syntha.test/v2/workspace', { headers: { authorization: 'Bearer valid-token' } }));
  assert.equal(response.status, 400);
});

test('the deliberate unclassified-validation default stays 422', () => {
  assert.equal(normalizeHttpError(new DomainError('CATALOG_PRICE_INVALID', 'Invalid catalog price')).status, 422);
  assert.equal(isServerFaultCode('CATALOG_PRICE_INVALID'), false);
});

test('server fault classification covers readers, results, clocks and the RNG', () => {
  for (const code of [
    'WORKSPACE_PAGE_RESULT_INVALID', 'CATALOG_PAGE_RESULT_INVALID', 'BOM_PAGE_RESULT_INVALID',
    'COMMAND_RESULT_INVALID', 'SAMPLE_READER_REQUIRED', 'OUTBOX_DEAD_LETTER_READER_UNAVAILABLE',
    'AUTH_CLOCK_INVALID', 'NOTIFICATION_CLOCK_INVALID', 'AUTH_RANDOM_SOURCE_INVALID',
  ]) {
    assert.equal(normalizeHttpError(new DomainError(code, 'server side')).status, 500, code);
  }
});

test('server fault classification does not capture client-facing codes', () => {
  for (const code of [
    'WORKSPACE_LIMIT_INVALID', 'CATALOG_CURSOR_INVALID', 'ORDER_EXPECTED_VERSION_INVALID',
    'HTTP_JSON_INVALID', 'SAMPLE_NOT_DRAFT', 'ORDER_CONCURRENCY_CONFLICT', 'CAPABILITY_DENIED',
  ]) {
    assert.equal(isServerFaultCode(code), false, code);
    assert.notEqual(normalizeHttpError(new DomainError(code, 'client side')).status, 500, code);
  }
});

test('a server fault still carries no retry-after and keeps its details', () => {
  const normalized = normalizeHttpError(new DomainError('TECH_PACK_PAGE_RESULT_INVALID', 'broken', { limit: 10 }));
  assert.deepEqual(normalized, { status: 500, code: 'TECH_PACK_PAGE_RESULT_INVALID', message: 'broken', details: { limit: 10 } });
});
