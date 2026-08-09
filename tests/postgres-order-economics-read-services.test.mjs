import test from 'node:test';
import assert from 'node:assert/strict';
import { createPostgresOrderEconomicsReadServices } from '../src/runtime/postgres-order-economics-read-services.mjs';

test('PostgreSQL economics read-service factory composes position and margin bridge APIs', () => {
  const pool = {
    connect: async () => { throw new Error('not used in composition test'); },
    query: async () => { throw new Error('not used in composition test'); },
  };
  const service = createPostgresOrderEconomicsReadServices({ pool });
  assert.equal(typeof service.getOrderEconomicsPositionForActor, 'function');
  assert.equal(typeof service.getOrderMarginBridgeForActor, 'function');
  assert.ok(Object.isFrozen(service));
});
