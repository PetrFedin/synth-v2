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

test('unclassified domain validation errors remain unprocessable entities', () => {
  const normalized = normalizeHttpError(new DomainError('CATALOG_PRICE_INVALID', 'Invalid catalog price'));
  assert.equal(normalized.status, 422);
});
