import test from 'node:test';
import assert from 'node:assert/strict';
import {
  outboxRecoveryExitCode,
  parseOutboxRecoveryArguments,
  resolveOutboxDatabaseUrl,
} from '../src/runtime/outbox-recovery-command.mjs';

test('recovery command parser returns a normalized immutable request', () => {
  const parsed = parseOutboxRecoveryArguments([
    'event-1',
    'operator-1',
    '  Upstream',
    'mapping',
    'fixed  ',
  ]);
  assert.deepEqual(parsed, {
    eventId: 'event-1',
    actorId: 'operator-1',
    reason: 'Upstream mapping fixed',
  });
  assert.equal(Object.isFrozen(parsed), true);
});

test('recovery command rejects missing, padded and oversized identifiers before database access', () => {
  for (const args of [
    [],
    [' event-1 ', 'operator-1', 'reason'],
    ['event-1', ' operator-1 ', 'reason'],
    ['event-1', 'operator-1'],
    ['event-1', 'operator-1', 'x'.repeat(501)],
  ]) {
    assert.throws(
      () => parseOutboxRecoveryArguments(args),
      (error) => outboxRecoveryExitCode(error) === 64,
    );
  }
});

test('database URL resolution prefers the Syntha-specific setting and preserves exact bytes', () => {
  assert.equal(resolveOutboxDatabaseUrl({
    SYNTHA_V2_DATABASE_URL: ' postgres://syntha-specific ',
    DATABASE_URL: 'postgres://fallback',
  }), ' postgres://syntha-specific ');
  assert.equal(resolveOutboxDatabaseUrl({ DATABASE_URL: 'postgres://fallback' }), 'postgres://fallback');
  assert.throws(
    () => resolveOutboxDatabaseUrl({}),
    (error) => error.code === 'OUTBOX_DATABASE_URL_REQUIRED' && outboxRecoveryExitCode(error) === 64,
  );
});

test('unexpected infrastructure failures retain a non-usage exit code', () => {
  assert.equal(outboxRecoveryExitCode(Object.assign(new Error('database failed'), { code: 'ECONNREFUSED' })), 1);
  assert.equal(outboxRecoveryExitCode(new Error('unknown')), 1);
});
