import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);

test('PostgreSQL runtime wires sourcing and Tech Pack commands, reads, routes and transport', async () => {
  const source = await readFile(path.join(root, 'src/runtime/postgres-runtime.mjs'), 'utf8');
  for (const fragment of [
    'createSourcingService',
    'createSourcingQueryService',
    'createPostgresSourcingStore',
    'createPostgresSourcingReader',
    'const sourcingStore = createPostgresSourcingStore({ pool })',
    'const sourcing = Object.freeze({ ...createSourcingService',
    '...createSourcingQueryService',
    'createTechPackService',
    'createTechPackQueryService',
    'createPostgresTechPackStore',
    'createPostgresTechPackReader',
    'const techPackStore = createPostgresTechPackStore({ pool })',
    'const techPacks = Object.freeze({ ...createTechPackService',
    'samples, partners, sourcing, techPacks, collaboration',
    'sampleStore, sourcingStore, techPackStore',
  ]) assert.ok(source.includes(fragment), `missing runtime wiring: ${fragment}`);
});

test('HTTP composition exposes sourcing and Tech Pack routes and OpenAPI', async () => {
  const [routes, openapi, api] = await Promise.all([
    readFile(path.join(root, 'src/http/all-routes.mjs'), 'utf8'),
    readFile(path.join(root, 'src/http/v2-openapi.mjs'), 'utf8'),
    readFile(path.join(root, 'src/http/api.mjs'), 'utf8'),
  ]);
  assert.ok(routes.includes('createSourcingRoutes'));
  assert.ok(routes.includes('...createSourcingRoutes({ sourcing: services.sourcing })'));
  assert.ok(routes.includes('createTechPackRoutes'));
  assert.ok(routes.includes('...createTechPackRoutes({ techPacks: services.techPacks })'));
  assert.ok(openapi.includes('withSourcingOpenApi'));
  assert.ok(openapi.includes('withTechPackOpenApi'));
  assert.match(openapi, /withTechPackOpenApi\(\s*withSourcingOpenApi/);
  assert.ok(api.includes('SOURCING_CURSOR_INVALID'));
  assert.ok(api.includes('RFQ_NOT_ALLOCATABLE'));
});
