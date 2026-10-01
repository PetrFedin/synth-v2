import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ROLE_CAPABILITIES, CAPABILITIES } from '../src/modules/access-control/public.mjs';

const roles = (name) => readFile(new URL(`../src/infrastructure/postgres-${name}-reader.mjs`, import.meta.url), 'utf8')
  .then((source) => JSON.parse(/READ_ROLES = Object\.freeze\((\[[^\]]*\])\)/.exec(source)[1].replaceAll("'", '"')));

test('a role holding the read capability is listed by the reader that serves it', async () => {
  const cases = [
    ['final-quality', CAPABILITIES.QUALITY_READ], ['inline-quality', CAPABILITIES.QUALITY_READ],
    ['material-lot', CAPABILITIES.QUALITY_READ], ['cutting', CAPABILITIES.QUALITY_READ],
    ['production-execution', CAPABILITIES.PRODUCTION_EXECUTION_READ],
  ];
  for (const [reader, capability] of cases) {
    const listed = await roles(reader);
    for (const role of ['quality', 'production']) {
      assert.ok(ROLE_CAPABILITIES[role].includes(capability), `${role} should hold ${capability}`);
      assert.ok(listed.includes(role), `${reader} reader does not serve ${role}`);
    }
  }
});

test('the production order reader stays closed to them: its payload carries the commercial snapshot', async () => {
  const listed = await roles('production-order');
  assert.ok(!listed.includes('quality') && !listed.includes('production'));
});
