import test from 'node:test';
import assert from 'node:assert/strict';
import { DomainError } from '../src/core/errors.mjs';
import { normalizeHttpError } from '../src/http/api.mjs';

test('invalid workspace bootstrap limits are exposed as HTTP 400', () => {
  const normalized = normalizeHttpError(new DomainError(
    'WORKSPACE_LIMIT_INVALID',
    'Workspace limit must be an integer from 1 to 500',
    { min: 1, max: 500 },
  ));
  assert.deepEqual(normalized, {
    status: 400,
    code: 'WORKSPACE_LIMIT_INVALID',
    message: 'Workspace limit must be an integer from 1 to 500',
    details: { min: 1, max: 500 },
    retryAfterSeconds: undefined,
  });
});
