import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const baseRuntime = await readFile(new URL('../src/runtime/postgres-base-runtime.mjs', import.meta.url), 'utf8');
const fullRuntime = await readFile(new URL('../src/runtime/postgres-runtime.mjs', import.meta.url), 'utf8');

test('operational collaboration is constructed in the PostgreSQL base runtime', () => {
  assert.match(baseRuntime, /createOperationalCollaborationService/);
  assert.match(baseRuntime, /createPostgresOperationalCollaborationStore/);
  assert.match(baseRuntime, /operationalCollaboration/);
});

test('full PostgreSQL runtime preserves operational collaboration in its HTTP transport', () => {
  assert.match(fullRuntime, /operationalCollaboration:\s*base\.operationalCollaboration/);
  const transportStart = fullRuntime.indexOf('const transport = {');
  const handlerStart = fullRuntime.indexOf('const handler = createWholesaleHttpHandler(transport)', transportStart);
  assert.ok(transportStart >= 0 && handlerStart > transportStart);
  const transportBlock = fullRuntime.slice(transportStart, handlerStart);
  assert.match(transportBlock, /operationalCollaboration:\s*base\.operationalCollaboration/);
});

test('full runtime forwarding does not introduce a second collaboration authority', () => {
  assert.doesNotMatch(fullRuntime, /createOperationalCollaborationService/);
  assert.doesNotMatch(fullRuntime, /createPostgresOperationalCollaborationStore/);
});
