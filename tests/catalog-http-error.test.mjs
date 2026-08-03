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
]) {
  test(`${code} is exposed as HTTP 400`, () => {
    assert.equal(normalizeHttpError(new DomainError(code, 'invalid')).status, 400);
  });
}
