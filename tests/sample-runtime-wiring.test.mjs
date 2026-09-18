import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = async (relative) => readFile(path.join(root, relative), 'utf8');

test('Node and Fetch transports compose the same Samples route registry', async () => {
  const [nodeHttp, fetchHttp, pipeline, routes, errorStatus] = await Promise.all([
    source('src/http/api.mjs'), source('src/http/fetch-api.mjs'), source('src/http/pipeline.mjs'),
    source('src/http/all-routes.mjs'), source('src/http/error-status.mjs'),
  ]);
  assert.match(nodeHttp, /from '\.\/pipeline\.mjs'/);
  assert.match(fetchHttp, /from '\.\/pipeline\.mjs'/);
  assert.match(pipeline, /from '\.\/all-routes\.mjs'/);
  assert.equal(nodeHttp.includes("from './all-routes.mjs'"), false, 'transports must not compose routes themselves');
  assert.equal(fetchHttp.includes("from './all-routes.mjs'"), false, 'transports must not compose routes themselves');
  assert.match(routes, /createSampleRoutes\(\{ samples: services\.samples \}\)/);
  for (const code of ['SAMPLE_CURSOR_INVALID', 'SAMPLE_EXPECTED_VERSION_INVALID', 'SAMPLE_NOT_RECEIVED']) assert.ok(errorStatus.includes(code), code);
});

test('PostgreSQL base runtime exposes one Samples command/query service and wrapper preserves it for both handlers', async () => {
  const [base, wrapper] = await Promise.all([source('src/runtime/postgres-base-runtime.mjs'), source('src/runtime/postgres-runtime.mjs')]);
  for (const symbol of ['createSampleService', 'createSampleQueryService', 'createPostgresSampleStore', 'createPostgresSampleReader']) assert.ok(base.includes(symbol), symbol);
  assert.match(base, /const samples = Object\.freeze/);
  assert.match(base, /transport = \{[\s\S]*?measurements, samples, partners/);
  assert.match(base, /measurementStore, sampleStore/);
  assert.match(base, /measurements, samples, partners/);
  assert.match(wrapper, /samples: base\.samples/);
});
