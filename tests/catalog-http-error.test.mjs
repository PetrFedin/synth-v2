import test from 'node:test';
import assert from 'node:assert/strict';
import { DomainError } from '../src/core/errors.mjs';
import { normalizeHttpError } from '../src/http/api.mjs';

for (const code of [
  'CATALOG_ACTOR_INVALID',
  'CATALOG_PAGE_LIMIT_INVALID',
  'CATALOG_CURSOR_INVALID',
  'CATALOG_SEARCH_INVALID',
  'CATALOG_STATUS_FILTER_INVALID',
  'CATALOG_BRAND_FILTER_INVALID',
  'CATALOG_COLLECTION_FILTER_INVALID',
  'CATALOG_EXPECTED_VERSION_INVALID',
  'CATALOG_UPDATE_INVALID',
  'CATALOG_PUBLISH_INVALID',
]) {
  test(`${code} is exposed as HTTP 400`, () => {
    assert.equal(normalizeHttpError(new DomainError(code, 'invalid')).status, 400);
  });
}

test('CATALOG_SKU_CONCURRENCY_CONFLICT is exposed as HTTP 409 with version details', () => {
  const normalized = normalizeHttpError(new DomainError('CATALOG_SKU_CONCURRENCY_CONFLICT', 'stale', { expectedVersion: 2, actualVersion: 3 }));
  assert.equal(normalized.status, 409);
  assert.deepEqual(normalized.details, { expectedVersion: 2, actualVersion: 3 });
});
