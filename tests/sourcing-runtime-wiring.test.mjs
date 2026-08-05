import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);

test('PostgreSQL runtime wires sourcing, Tech Packs and guarded allocation without replacing stable base services', async () => {
  const [base, wrapper] = await Promise.all([
    readFile(path.join(root, 'src/runtime/postgres-base-runtime.mjs'), 'utf8'),
    readFile(path.join(root, 'src/runtime/postgres-runtime.mjs'), 'utf8'),
  ]);
  for (const fragment of [
    'createSourcingService', 'createSourcingQueryService', 'createPostgresSourcingStore', 'createPostgresSourcingReader',
    'createTechPackService', 'createTechPackQueryService', 'createPostgresTechPackStore', 'createPostgresTechPackReader',
    'const sourcingStore = createPostgresSourcingStore({ pool })', 'const techPackStore = createPostgresTechPackStore({ pool })',
    'const techPacks = Object.freeze({ ...createTechPackService',
  ]) assert.ok(base.includes(fragment), `missing base runtime wiring: ${fragment}`);
  for (const fragment of [
    'createSourcingTechPackAllocationService',
    'createPostgresSourcingTechPackAllocationStore',
    'const allocationStore = createPostgresSourcingTechPackAllocationStore',
    'const sourcing = Object.freeze({ ...base.sourcing, ...allocation })',
    'sourcingTechPackAllocationStore: allocationStore',
    'createWholesaleHttpHandler(transport)',
  ]) assert.ok(wrapper.includes(fragment), `missing guarded allocation runtime wiring: ${fragment}`);
});

test('HTTP composition exposes sourcing, Tech Pack routes and guarded-allocation OpenAPI', async () => {
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
  assert.ok(openapi.includes('withSourcingTechPackGateOpenApi'));
  assert.match(openapi, /withSourcingTechPackGateOpenApi\(\s*withTechPackOpenApi/);
  assert.ok(api.includes('SOURCING_CURSOR_INVALID'));
  assert.ok(api.includes('RFQ_NOT_ALLOCATABLE'));
});
