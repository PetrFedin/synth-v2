import assert from 'node:assert/strict';
import test from 'node:test';
import { bootstrapProductionAcceptanceReferences } from '../src/acceptance/production-reference-bootstrap.mjs';

function createReplayGuardedPlatform() {
  const fingerprints = new Map();
  const calls = [];

  async function execute(kind, commandId, actorId, payload) {
    const fingerprint = JSON.stringify({ kind, actorId, payload });
    const existing = fingerprints.get(commandId);
    if (existing && existing !== fingerprint) {
      const error = new Error('commandId was already used by another mutation');
      error.code = 'COMMAND_ID_CONFLICT';
      throw error;
    }
    fingerprints.set(commandId, fingerprint);
    calls.push(Object.freeze({ kind, commandId, actorId, payload: structuredClone(payload), fingerprint }));
    return payload;
  }

  return {
    platform: {
      registerOrganisation(commandId, actorId, organisation) {
        return execute('registerOrganisation', commandId, actorId, organisation);
      },
      grantMembership(commandId, actorId, membership) {
        return execute('grantMembership', commandId, actorId, membership);
      },
    },
    fingerprints,
    calls,
  };
}

test('production acceptance reference bootstrap replays stable command payloads without COMMAND_ID_CONFLICT', async () => {
  const guarded = createReplayGuardedPlatform();

  const first = await bootstrapProductionAcceptanceReferences({ platform: guarded.platform });
  const second = await bootstrapProductionAcceptanceReferences({ platform: guarded.platform });

  assert.deepEqual(second, first);
  assert.equal(guarded.fingerprints.size, 7);
  assert.equal(guarded.calls.length, 14);

  const commandIds = [...guarded.fingerprints.keys()].sort();
  assert.deepEqual(commandIds, [
    'production-reference:grant-brand-finance',
    'production-reference:grant-brand-owner',
    'production-reference:grant-brand-production',
    'production-reference:grant-shop-buyer',
    'production-reference:grant-shop-owner',
    'production-reference:register-brand',
    'production-reference:register-shop',
  ]);

  for (const commandId of commandIds) {
    const repeated = guarded.calls.filter((call) => call.commandId === commandId);
    assert.equal(repeated.length, 2);
    assert.equal(repeated[0].fingerprint, repeated[1].fingerprint);
  }

  const membershipCalls = guarded.calls.filter((call) => call.kind === 'grantMembership');
  assert.equal(membershipCalls.length, 10);
  assert.ok(membershipCalls.every((call) => call.payload.createdAt === '2026-08-31T00:00:00.000Z'));
});
