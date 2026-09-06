import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { ensureAcceptanceActor } from '../src/acceptance/acceptance-auth.mjs';

test('Product commercialization acceptance stays on canonical public runtime routes', async () => {
  const source = await fs.readFile(new URL('../src/acceptance/product-commercialization-live-acceptance.mjs', import.meta.url), 'utf8');
  const script = await fs.readFile(new URL('../scripts/acceptance-product-commercialization.mjs', import.meta.url), 'utf8');

  for (const required of [
    '/v2/product/readiness/',
    '/commercial-projection',
    '/v2/product/commercial-projections/',
    '/v2/commercial-publications',
    '/buyer-catalogs',
    '/v2/buyer-catalog-versions/',
    '/style-versions',
  ]) {
    assert.match(source, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `missing canonical acceptance route ${required}`);
  }
  assert.doesNotMatch(source, /\/v2\/catalog\/skus/, 'P0.3 acceptance must not reintroduce flat catalog_skus as product/commercial truth');
  assert.match(source, /assertProductCommercializationPersistence/);
  assert.match(source, /productSkuId/);
  assert.match(source, /commercialProjectionContentHash/);
  assert.match(source, /expectedDeltasVerified/);
  assert.match(script, /runReadyProductReadinessLiveAcceptance/);
  assert.match(script, /runProductCommercializationLiveAcceptance/);
  assert.match(script, /SYNTHA_ACCEPTANCE_SHOP_(TOKEN|EMAIL|PASSWORD)/);
});

test('acceptance auth bootstrap is deterministic and refuses identity collisions', async () => {
  const calls = [];
  const auth = {
    async bootstrapUser(input) {
      calls.push(input);
      return { id: input.id, email: input.email };
    },
  };
  const emptyPool = { query: async () => ({ rows: [] }) };
  const created = await ensureAcceptanceActor({
    pool: emptyPool,
    auth,
    actorId: 'actor-1',
    email: 'Actor@Example.Test',
    password: 'secret',
    displayName: 'Actor',
    envLabel: 'test actor',
  });
  assert.deepEqual(created, { id: 'actor-1', email: 'actor@example.test', created: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].id, 'actor-1');
  assert.equal(calls[0].email, 'actor@example.test');

  const existingPool = {
    query: async () => ({ rows: [{ id: 'actor-1', email_normalized: 'actor@example.test', status: 'active' }] }),
  };
  const existing = await ensureAcceptanceActor({
    pool: existingPool,
    auth,
    actorId: 'actor-1',
    email: 'actor@example.test',
    password: 'secret',
    envLabel: 'test actor',
  });
  assert.deepEqual(existing, { id: 'actor-1', email: 'actor@example.test', created: false });
  assert.equal(calls.length, 1);

  const collisionPool = {
    query: async () => ({ rows: [{ id: 'different-actor', email_normalized: 'actor@example.test', status: 'active' }] }),
  };
  await assert.rejects(
    ensureAcceptanceActor({
      pool: collisionPool,
      auth,
      actorId: 'actor-1',
      email: 'actor@example.test',
      password: 'secret',
      envLabel: 'test actor',
    }),
    /does not match the production reference actor/,
  );
});
