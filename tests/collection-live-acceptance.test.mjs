import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertIsolationUnchanged,
  ensureAcceptanceBrandOwner,
  runCollectionLiveAcceptance,
  validateAcceptanceOrigin,
} from '../src/acceptance/collection-live-acceptance.mjs';
import { PRODUCTION_ACCEPTANCE_REFERENCES } from '../src/acceptance/production-reference-bootstrap.mjs';

test('acceptance target validation permits local HTTP and requires HTTPS remotely', () => {
  assert.equal(validateAcceptanceOrigin('http://127.0.0.1:4100').local, true);
  assert.equal(validateAcceptanceOrigin('https://acceptance.example.com/').local, false);
  assert.throws(() => validateAcceptanceOrigin('http://acceptance.example.com'), /must use HTTPS/);
  assert.throws(() => validateAcceptanceOrigin('https://user:secret@acceptance.example.com'), /must not contain credentials/);
  assert.throws(() => validateAcceptanceOrigin('https://acceptance.example.com?unsafe=1'), /must not contain query parameters/);
});

test('acceptance auth bootstrap creates exactly the stable brand owner identity', async () => {
  const calls = [];
  const pool = { query: async (sql, values) => { calls.push({ sql, values }); return { rows: [] }; } };
  const auth = {
    bootstrapUser: async (input) => Object.freeze({ id: input.id, email: input.email, displayName: input.displayName, status: 'active' }),
  };
  const user = await ensureAcceptanceBrandOwner({
    pool,
    auth,
    email: 'acceptance@example.com',
    password: 'not-printed-or-persisted',
  });
  assert.equal(user.id, PRODUCTION_ACCEPTANCE_REFERENCES.actors.brandOwner);
  assert.equal(user.created, true);
  assert.deepEqual(calls[0].values, [PRODUCTION_ACCEPTANCE_REFERENCES.actors.brandOwner, 'acceptance@example.com']);
});

test('acceptance auth bootstrap refuses identity collisions', async () => {
  const pool = {
    query: async () => ({ rows: [{ id: 'another-user', email_normalized: 'acceptance@example.com', status: 'active' }] }),
  };
  await assert.rejects(
    ensureAcceptanceBrandOwner({ pool, auth: { bootstrapUser() { throw new Error('must not execute'); } }, email: 'acceptance@example.com', password: 'x' }),
    /does not match the production reference actor/,
  );
});

test('isolation assertion identifies warehouse or economics drift', () => {
  const before = { inventory_balance_rows: '1', warehouse_ledger_rows: '0', actual_cost_amount: '0' };
  assert.equal(assertIsolationUnchanged(before, { ...before }), true);
  assert.throws(
    () => assertIsolationUnchanged(before, { ...before, actual_cost_amount: '10' }),
    (error) => error.code === 'ACCEPTANCE_ISOLATION_CHANGED' && error.details.actual_cost_amount.before === '0' && error.details.actual_cost_amount.after === '10',
  );
});

test('live collection acceptance uses authenticated idempotent HTTP flow and leaves physical state unchanged', async () => {
  const requests = [];
  const snapshot = {
    inventory_balance_rows: '0',
    inventory_available_quantity: '0',
    inventory_reserved_quantity: '0',
    warehouse_ledger_rows: '0',
    warehouse_on_hand_delta: '0',
    warehouse_available_delta: '0',
    warehouse_quarantine_delta: '0',
    actual_cost_ledger_rows: '0',
    actual_cost_amount: '0',
    supply_commitment_rows: '0',
  };
  const pool = { query: async () => ({ rows: [{ ...snapshot }] }) };
  const fetchImpl = async (url, options = {}) => {
    const parsed = new URL(url);
    const method = options.method ?? 'GET';
    requests.push({ path: parsed.pathname, method, headers: { ...(options.headers ?? {}) }, body: options.body });
    const key = `${method} ${parsed.pathname}`;
    const payloads = {
      'GET /health': { status: 'ok' },
      'GET /ready': { status: 'ready' },
      'GET /v2/auth/me': { data: { actorId: PRODUCTION_ACCEPTANCE_REFERENCES.actors.brandOwner } },
      'POST /v2/campaigns': { data: { id: 'campaign-acceptance', status: 'draft' } },
      'POST /v2/campaigns/campaign-acceptance/open': { data: { id: 'campaign-acceptance', status: 'open' } },
      'POST /v2/collections': { data: { id: 'collection-acceptance', status: 'draft' } },
      'POST /v2/collections/collection-acceptance/publish': { data: { id: 'collection-acceptance', status: 'published' } },
    };
    assert.ok(payloads[key], `unexpected acceptance request ${key}`);
    return response(payloads[key]);
  };

  const result = await runCollectionLiveAcceptance({
    baseUrl: 'http://127.0.0.1:4100',
    token: 'opaque-test-token',
    pool,
    fetchImpl,
    runId: 'run-001',
  });

  assert.equal(result.status, 'passed');
  assert.equal(result.actorId, PRODUCTION_ACCEPTANCE_REFERENCES.actors.brandOwner);
  assert.deepEqual(result.campaign, { id: 'campaign-acceptance', status: 'open' });
  assert.deepEqual(result.collection, { id: 'collection-acceptance', status: 'published' });
  assert.equal(result.isolation.unchanged, true);

  const mutations = requests.filter((request) => request.method === 'POST' && !request.path.includes('/auth/'));
  assert.equal(mutations.length, 4);
  for (const request of mutations) {
    assert.match(request.headers['idempotency-key'], /^acceptance-run-001-/);
    assert.equal(request.headers.authorization, 'Bearer opaque-test-token');
    assert.equal(request.headers['content-type'], 'application/json');
  }
});

test('live collection acceptance rejects a token for the wrong actor before business mutation', async () => {
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    const parsed = new URL(url);
    requests.push(`${options.method ?? 'GET'} ${parsed.pathname}`);
    if (parsed.pathname === '/health') return response({ status: 'ok' });
    if (parsed.pathname === '/ready') return response({ status: 'ready' });
    if (parsed.pathname === '/v2/auth/me') return response({ data: { actorId: 'someone-else' } });
    throw new Error('business mutation must not execute');
  };
  await assert.rejects(
    runCollectionLiveAcceptance({
      baseUrl: 'http://localhost:4100', token: 'opaque-test-token', pool: { query: async () => ({ rows: [] }) }, fetchImpl, runId: 'wrong-actor',
    }),
    /Acceptance token must authenticate as/,
  );
  assert.deepEqual(requests, ['GET /health', 'GET /ready', 'GET /v2/auth/me']);
});

function response(payload, status = 200) {
  return Object.freeze({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(payload),
  });
}
