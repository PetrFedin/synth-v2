import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('a measurement chart revision carries the schema image and every point\'s receiving-check flag', async () => {
  const source = await read('public/modules/measurement-revision-actions.js');
  const body = source.slice(source.indexOf('function buildEditablePayload'), source.indexOf('function replaceChart'));
  assert.match(body, /schemaImageUri: chart\.schemaImageUri \?\? null/);
  assert.match(body, /qcChecked: point\.qcChecked === true/);
});

test('the bill-of-materials editor keeps a line\'s placement and main flag when it loads and when it saves', async () => {
  const source = await read('public/modules/bom.js');
  assert.match(source, /placement: line\.placement \|\| '', isMain: line\.isMain === true \}\)\),\n    \};/);
  assert.match(source, /placement: String\(line\.placement \|\| ''\)\.trim\(\) \|\| null, isMain: line\.isMain === true \}\)\),/);
});

test('an empty material price-tier field omits the key instead of sending null, which the route refuses', async () => {
  const source = await read('public/modules/sourcing.js');
  assert.match(source, /\.\.\.tiersField\(values\.tiers\)/);
  assert.doesNotMatch(source, /tiers: parseQuoteTiers\(values\.tiers\)/);
  assert.match(source, /return tiers \? \{ tiers \} : \{\};/);
});

test('creating a selection sends the Retail Door the server requires, and adding a SKU does not compare against a currency selections do not have', async () => {
  const source = await read('public/modules/forms-3.js');
  const create = source.slice(source.indexOf('async function selectionForm'), source.indexOf('async function selectionLineForm'));
  assert.match(create, /retailDoorId: door\.id/);
  assert.match(create, /dependentSelectDef\(\s*'retailDoorId'/);
  const line = source.slice(source.indexOf('async function selectionLineForm'), source.indexOf('async function orderForm'));
  assert.doesNotMatch(line, /selection\.currency/);
});
