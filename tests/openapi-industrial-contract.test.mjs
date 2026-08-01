import test from 'node:test';
import assert from 'node:assert/strict';
import { wholesaleV2OpenApi } from '../src/http/openapi.mjs';

function operation(path, method) {
  const value = wholesaleV2OpenApi.paths[path]?.[method];
  assert.ok(value, `Missing ${method.toUpperCase()} ${path}`);
  return value;
}

test('all domain mutations document one global Idempotency-Key namespace', () => {
  const mutations = Object.entries(wholesaleV2OpenApi.paths)
    .flatMap(([path, methods]) => Object.entries(methods).map(([method, value]) => ({ path, method, value })))
    .filter(({ path, method }) => path.startsWith('/v2/') && ['post', 'put', 'patch', 'delete'].includes(method))
    .filter(({ path }) => !['/v2/auth/login', '/v2/auth/logout'].includes(path));

  assert.ok(mutations.length > 0);
  for (const { path, method, value } of mutations) {
    const header = value.parameters?.find((parameter) => parameter.in === 'header' && parameter.name === 'Idempotency-Key');
    assert.ok(header, `${method.toUpperCase()} ${path} must require Idempotency-Key`);
    assert.equal(header.required, true);
    assert.equal(header.schema.minLength, 1);
    assert.equal(header.schema.maxLength, 128);
    assert.match(header.description, /Globally unique/i);
    assert.match(header.description, /HTTP 409/i);
    assert.ok(value.responses['409'], `${method.toUpperCase()} ${path} must document conflicts`);
  }
});

test('workspace bootstrap documents per-section bounds and truncation metadata', () => {
  const workspace = operation('/v2/workspace', 'get');
  const limit = workspace.parameters?.find((parameter) => parameter.in === 'query' && parameter.name === 'limit');
  assert.ok(limit);
  assert.deepEqual(limit.schema, {
    type: 'integer',
    minimum: 1,
    maximum: 500,
    default: 200,
  });
  assert.match(limit.description, /each workspace collection/i);
  assert.match(limit.description, /truncatedSections/);
  assert.match(workspace.description, /repeatable-read/i);
  assert.match(workspace.description, /pageInfo\.hasMore/);
  assert.ok(workspace.responses['400']);
});
