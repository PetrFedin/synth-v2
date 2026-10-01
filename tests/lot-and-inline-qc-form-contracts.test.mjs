import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('an operation-level inline check the screen sends is accepted by the route and declared in OpenAPI', async () => {
  const [ui, routes, openapi, service] = await Promise.all([
    read('public/modules/production-executions.js'), read('src/http/inline-quality-routes.mjs'),
    read('src/http/inline-quality-openapi.mjs'), read('src/application/inline-quality-service.mjs'),
  ]);
  assert.match(ui, /operationId: ui\.qcOperationId/);
  assert.match(service, /CHECK_FIELDS = .*'operationId'/);
  assert.match(routes, /CHECK_BODY = bodyContract\(\[[^\]]*'operationId'/);
  assert.match(openapi, /InlineQualityCheckInput[\s\S]*?operationId: \{ type: 'string'/);
});

test('the reason typed when releasing a lot is kept as its release notes, not discarded', async () => {
  const service = await read('src/application/material-lot-service.mjs');
  assert.match(service, /notes: input\.notes \?\? input\.reason/);
});

test('every lot mutation drops the cached lot table so the next action is not written against a stale version', async () => {
  const [materials, actions] = await Promise.all([read('public/modules/materials.js'), read('public/modules/material-lot-actions.js')]);
  assert.match(materials, /SynthaMaterialLotsInvalidate = \(\) => \{[^}]*lotsLoaded = false/);
  assert.doesNotMatch(actions, /return mutate\(/);
  assert.equal((actions.match(/return mutateLots\(/g) ?? []).length, 3);
  assert.match(actions, /SynthaMaterialLotsInvalidate\?\.\(\)/);
});
