import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('V18 runtime record schema keeps decimal values as strings and histories separate', async () => {
  const raw = await readFile(path.join(root, 'docs', 'fashion-kpi', 'kpi-runtime-records.schema.json'), 'utf8');
  const schema = JSON.parse(raw);

  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.match(schema.$id, /v18/);
  assert.equal(schema.oneOf.length, 8);
  assert.equal(schema.$defs.decimal.type, 'string');
  assert.match(schema.$defs.decimal.pattern, /\[0-9\]\{1,12\}/);

  const observation = schema.$defs.observation;
  assert.ok(observation);
  assert.equal(observation.properties.valueNumeric.$ref, '#/$defs/decimalOrNull');
  assert.equal(observation.properties.numeratorNumeric.$ref, '#/$defs/decimalOrNull');
  assert.equal(observation.properties.denominatorNumeric.$ref, '#/$defs/decimalOrNull');
  assert.equal(observation.properties.normalizerK.$ref, '#/$defs/decimalOrNull');

  const zeroRule = observation.allOf.find((rule) => rule.if?.properties?.dataState?.const === 'ZERO');
  assert.equal(zeroRule.then.properties.valueNumeric.const, '0');

  const nonValueRule = observation.allOf.find((rule) => Array.isArray(rule.if?.properties?.dataState?.enum));
  assert.deepEqual(nonValueRule.if.properties.dataState.enum, ['NOT_APPLICABLE', 'MISSING', 'INVALID']);
  assert.equal(nonValueRule.then.properties.valueNumeric.type, 'null');

  assert.ok(schema.$defs.calculationRun);
  assert.ok(schema.$defs.runStatusEvent);
  assert.ok(schema.$defs.runDefinitionBinding);
  assert.ok(schema.$defs.runMappingBinding);
  assert.ok(schema.$defs.qualityResult);
  assert.ok(schema.$defs.reconciliationResult);
  assert.ok(schema.$defs.runRestatement);
});
