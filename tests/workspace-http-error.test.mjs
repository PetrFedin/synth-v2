import test from 'node:test';
import assert from 'node:assert/strict';
import { DomainError } from '../src/core/errors.mjs';
import { normalizeHttpError } from '../src/http/api.mjs';

const workspaceBadRequestCodes = Object.freeze([
  ['WORKSPACE_LIMIT_INVALID', 'Workspace limit must be an integer from 1 to 500', { min: 1, max: 500 }],
  ['WORKSPACE_SECTION_INVALID', 'Workspace section is invalid', { allowed: ['orders'] }],
  ['WORKSPACE_PAGE_LIMIT_INVALID', 'Workspace page limit must be an integer from 1 to 200', { min: 1, max: 200 }],
  ['WORKSPACE_CURSOR_INVALID', 'Workspace cursor encoding is invalid', {}],
]);

test('invalid workspace bootstrap and page inputs are exposed as HTTP 400', () => {
  for (const [code, message, details] of workspaceBadRequestCodes) {
    assert.deepEqual(normalizeHttpError(new DomainError(code, message, details)), {
      status: 400,
      code,
      message,
      details,
      retryAfterSeconds: undefined,
    });
  }
});
