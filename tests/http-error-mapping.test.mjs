import test from 'node:test';
import assert from 'node:assert/strict';
import { DomainError } from '../src/core/errors.mjs';
import { normalizeHttpError } from '../src/http/api.mjs';

for (const code of ['NOTIFICATION_PAGE_LIMIT_INVALID', 'NOTIFICATION_CURSOR_INVALID']) {
  test(`${code} is exposed as a client bad request`, () => {
    const normalized = normalizeHttpError(new DomainError(code, 'Invalid notification page input'));
    assert.equal(normalized.status, 400);
    assert.equal(normalized.code, code);
  });
}

test('global idempotency scope conflicts are exposed as HTTP 409', () => {
  const normalized = normalizeHttpError(new DomainError(
    'COMMAND_SCOPE_CONFLICT',
    'Idempotency key is already assigned to another command scope',
    { commandId: 'command-1', requestedScope: 'catalog', registeredScope: 'wholesale' },
  ));
  assert.equal(normalized.status, 409);
  assert.equal(normalized.code, 'COMMAND_SCOPE_CONFLICT');
  assert.deepEqual(normalized.details, {
    commandId: 'command-1',
    requestedScope: 'catalog',
    registeredScope: 'wholesale',
  });
});

test('unclassified domain validation errors remain unprocessable entities', () => {
  const normalized = normalizeHttpError(new DomainError('CATALOG_PRICE_INVALID', 'Invalid catalog price'));
  assert.equal(normalized.status, 422);
});
