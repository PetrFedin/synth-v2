import test from 'node:test';
import assert from 'node:assert/strict';
import { createPartnerAccessService } from '../src/application/partner-access-service.mjs';

function replayStore({ membership }) {
  const calls = [];
  const previousResult = Object.freeze({
    id: 'relationship-1',
    brandId: 'brand-1',
    shopId: 'shop-1',
    requestedByOrganisationId: 'brand-1',
    status: 'active',
    version: 2,
  });
  return {
    calls,
    previousResult,
    store: {
      async transaction(work) {
        return work({
          async getCommand(id) {
            calls.push(`command:${id}`);
            return Object.freeze({
              id,
              actorId: 'buyer-1',
              fingerprint: 'acceptRelationship:buyer-1:relationship-1',
              result: previousResult,
            });
          },
          async getRelationship(id) {
            calls.push(`relationship:${id}`);
            return previousResult;
          },
          async getMembership(organisationId, userId) {
            calls.push(`membership:${organisationId}:${userId}`);
            return membership;
          },
          saveRelationship() { throw new Error('replay must not save relationship'); },
          appendOutbox() { throw new Error('replay must not append outbox'); },
          insertCommand() { throw new Error('replay must not insert command'); },
        });
      },
      async snapshot() { return {}; },
    },
  };
}

test('revoked responder cannot retrieve a stored relationship result', async () => {
  const fixture = replayStore({ membership: undefined });
  const service = createPartnerAccessService({ store: fixture.store });

  await assert.rejects(
    () => service.acceptRelationship('command-1', 'buyer-1', 'relationship-1'),
    (error) => error.code === 'ACTIVE_MEMBERSHIP_REQUIRED',
  );
  assert.deepEqual(fixture.calls, [
    'command:command-1',
    'relationship:relationship-1',
    'membership:shop-1:buyer-1',
  ]);
});

test('authorized relationship replay returns the stored result after live authorization', async () => {
  const fixture = replayStore({
    membership: Object.freeze({
      organisationId: 'shop-1',
      userId: 'buyer-1',
      organisationType: 'shop',
      status: 'active',
      role: 'buyer',
    }),
  });
  const service = createPartnerAccessService({ store: fixture.store });

  const result = await service.acceptRelationship('command-1', 'buyer-1', 'relationship-1');

  assert.equal(result, fixture.previousResult);
  assert.deepEqual(fixture.calls, [
    'command:command-1',
    'relationship:relationship-1',
    'membership:shop-1:buyer-1',
  ]);
});

test('relationship replay is denied when the current role no longer grants partner management', async () => {
  const fixture = replayStore({
    membership: Object.freeze({
      organisationId: 'shop-1',
      userId: 'buyer-1',
      organisationType: 'shop',
      status: 'active',
      role: 'viewer',
    }),
  });
  const service = createPartnerAccessService({ store: fixture.store });

  await assert.rejects(
    () => service.acceptRelationship('command-1', 'buyer-1', 'relationship-1'),
    (error) => error.code === 'CAPABILITY_DENIED',
  );
});
