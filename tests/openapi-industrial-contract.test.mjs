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
    .filter(({ method }) => ['post', 'put', 'patch', 'delete'].includes(method))
    .filter(({ path }) => !['/auth/login', '/auth/logout'].includes(path));

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

test('workspace bootstrap documents per-section bounds and exact continuations', () => {
  const workspace = operation('/workspace', 'get');
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
  assert.match(limit.description, /nextCursors/);
  assert.match(limit.description, /workspace\/\{section\}\/page/);
  assert.match(workspace.description, /repeatable-read/i);
  assert.match(workspace.description, /pageInfo\.truncatedSections/);
  assert.match(workspace.description, /pageInfo\.nextCursors/);
  assert.ok(workspace.responses['400']);
  assert.equal(workspace.responses['200'].content['application/json'].schema.$ref, '#/components/schemas/Workspace');

  const pageInfo = wholesaleV2OpenApi.components.schemas.WorkspacePageInfo;
  assert.deepEqual(pageInfo.required, ['limit', 'hasMore', 'truncatedSections', 'nextCursors']);
  assert.deepEqual(pageInfo.properties.nextCursors.propertyNames.enum, pageInfo.properties.truncatedSections.items.enum);
  assert.deepEqual(pageInfo.properties.nextCursors.additionalProperties, {
    type: 'string', minLength: 1, maxLength: 2048,
  });
});

test('workspace section pages document bounded opaque keyset cursors', () => {
  const page = operation('/workspace/{section}/page', 'get');
  const section = page.parameters.find((parameter) => parameter.name === 'section');
  const limit = page.parameters.find((parameter) => parameter.name === 'limit');
  const cursor = page.parameters.find((parameter) => parameter.name === 'cursor');

  assert.equal(section.in, 'path');
  assert.equal(section.required, true);
  assert.deepEqual(section.schema.enum, [
    'memberships', 'organisations', 'relationships', 'invitations', 'campaigns', 'collections',
    'catalogSkus', 'showrooms', 'cycles', 'selections', 'orders', 'deals', 'calendar',
  ]);
  assert.deepEqual(limit.schema, { type: 'integer', minimum: 1, maximum: 200, default: 50 });
  assert.equal(cursor.schema.maxLength, 2048);
  assert.match(cursor.description, /Opaque continuation cursor/i);
  assert.match(page.description, /keyset-paginated/i);
  assert.match(page.description, /section-bound/i);
  assert.equal(page.responses[200].content['application/json'].schema.$ref, '#/components/schemas/WorkspaceSectionPage');
  assert.ok(page.responses[400]);
  assert.ok(page.responses[401]);
});

test('operational endpoints remain outside the authenticated /v2 server prefix', () => {
  assert.deepEqual(wholesaleV2OpenApi.servers, [{ url: '/v2', description: 'Authenticated Syntha V2 API prefix' }]);
  assert.deepEqual(wholesaleV2OpenApi['x-operational-endpoints'], {
    liveness: '/health',
    readiness: '/ready',
    specification: '/openapi.json',
    metrics: '/metrics',
  });
});
