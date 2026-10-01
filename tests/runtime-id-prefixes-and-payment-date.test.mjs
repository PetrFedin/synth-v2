import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { createRuntimeIdGenerator } from '../src/runtime/id-generator.mjs';

async function sources(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await sources(full));
    else if (entry.name.endsWith('.mjs')) out.push(full);
  }
  return out;
}

test('every id prefix the application asks the runtime generator for is one the generator accepts', async () => {
  // The unit tests inject their own nextId, so a prefix the real generator refuses (1 to 32 lowercase
  // letters, digits or dashes) only fails in production: the post-close allocation reconciliation used a
  // 36-character prefix and failed on every call.
  const nextId = createRuntimeIdGenerator();
  const used = new Set();
  for (const file of await sources(new URL('../src', import.meta.url).pathname)) {
    for (const match of (await readFile(file, 'utf8')).matchAll(/nextId\('([^']+)'\)/g)) used.add(match[1]);
  }
  assert.ok(used.size > 50, 'expected to find the application id prefixes');
  for (const prefix of used) assert.doesNotThrow(() => nextId(prefix), `prefix "${prefix}" is refused by the runtime id generator`);
});

test('a supplier payment cannot be recorded with a date in the future', async () => {
  const service = await readFile(new URL('../src/application/supplier-payment-service.mjs', import.meta.url), 'utf8');
  assert.match(service, /PAYMENT_PAID_AT_IN_FUTURE/);
  assert.match(service, /Date\.parse\(input\.paidAt\) <= Date\.parse\(now\)/);
});
