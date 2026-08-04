import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = async (relative) => readFile(path.join(root, relative), 'utf8');

test('Node and Fetch transports compose the same Samples route registry', async () => {
  const [nodeHttp, fetchHttp, routes] = await Promise.all([source('src/http/api.mjs'), source('src/http/fetch-api.mjs'), source('src/http/all-routes.mjs')]);
  assert.match(nodeHttp, /from '\.\/all-routes\.mjs'/);
  assert.match(fetchHttp, /from '\.\/all-routes\.mjs'/);
  assert.match(routes, /createSampleRoutes\(\{ samples: services\.samples \}\)/);
  assert.match(routes, /createTechPackRoutes\(\{ techPacks: services\.techPacks \}\)/);
  for (const code of ['SAMPLE_CURSOR_INVALID', 'SAMPLE_EXPECTED_VERSION_INVALID', 'SAMPLE_NOT_RECEIVED']) assert.ok(nodeHttp.includes(code), code);
});

test('PostgreSQL runtime exposes Samples and Tech Packs command/query services to both handlers', async () => {
  const runtime = await source('src/runtime/postgres-runtime.mjs');
  for (const symbol of ['createSampleService', 'createSampleQueryService', 'createPostgresSampleStore', 'createPostgresSampleReader', 'createTechPackService', 'createTechPackQueryService', 'createPostgresTechPackStore', 'createPostgresTechPackReader']) assert.ok(runtime.includes(symbol), symbol);
  assert.match(runtime, /const samples = Object\.freeze/);
  assert.match(runtime, /const techPacks = Object\.freeze/);
  assert.match(runtime, /transport = \{[\s\S]*?measurements, samples, techPacks, partners/);
  assert.match(runtime, /measurementStore, sampleStore, techPackStore/);
  assert.match(runtime, /measurements, samples, techPacks, partners/);
});
