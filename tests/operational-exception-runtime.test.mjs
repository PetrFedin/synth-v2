import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const base=await readFile(new URL('../src/runtime/postgres-base-runtime.mjs',import.meta.url),'utf8');
const full=await readFile(new URL('../src/runtime/postgres-runtime.mjs',import.meta.url),'utf8');
const routes=await readFile(new URL('../src/http/all-routes.mjs',import.meta.url),'utf8');
const openapi=await readFile(new URL('../src/http/v2-openapi.mjs',import.meta.url),'utf8');

test('exception authority is constructed once in base runtime and forwarded by full runtime',()=>{
  assert.match(base,/createOperationalExceptionService/);
  assert.match(base,/createPostgresOperationalExceptionStore/);
  assert.match(base,/operationalExceptions/);
  assert.match(full,/operationalExceptions:\s*base\.operationalExceptions/);
  assert.doesNotMatch(full,/createOperationalExceptionService/);
  assert.doesNotMatch(full,/createPostgresOperationalExceptionStore/);
});

test('exception routes and OpenAPI are composed into the authoritative v2 surface',()=>{
  assert.match(routes,/createOperationalExceptionRoutes/);
  assert.match(routes,/services\.operationalExceptions/);
  assert.match(openapi,/withOperationalExceptionOpenApi/);
});
