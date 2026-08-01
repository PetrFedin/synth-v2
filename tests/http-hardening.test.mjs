import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createWholesaleHttpServer } from '../src/http/api.mjs';

function fixture({ nextRequestId = () => 'request-safe' } = {}) {
  const calls = [];
  const service = (name) => async (...args) => { calls.push([name, ...args]); return { name, args }; };
  const server = createWholesaleHttpServer({
    authenticate: async (token) => token === 'valid-token' ? { actorId: 'user-1' } : null,
    platform: { createCampaign: service('createCampaign') },
    partners: { requestRelationship: service('requestRelationship') },
    collaboration: { upsertSelectionLine: service('upsertSelectionLine') },
    orders: {},
    notifications: { listForActor: service('listForActor') },
    workspace: { loadForActor: service('loadForActor') },
    nextRequestId,
  });
  return { server, calls };
}

async function withServer(context, work) {
  context.server.listen(0, '127.0.0.1');
  await once(context.server, 'listening');
  try { return await work(`http://127.0.0.1:${context.server.address().port}`); }
  finally { context.server.close(); await once(context.server, 'close'); }
}

function mutation(body, headers = {}) {
  return {
    method: 'POST',
    headers: {
      authorization: 'Bearer valid-token',
      'idempotency-key': 'command-1',
      'content-type': 'application/json',
      ...headers,
    },
    body,
  };
}

test('sanitizes untrusted request ids and applies API security headers', async () => {
  const context = fixture();
  await withServer(context, async (base) => {
    const response = await fetch(`${base}/health`, { headers: { 'x-request-id': 'unsafe request id' } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-request-id'), 'request-safe');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
    assert.equal(response.headers.get('cross-origin-resource-policy'), 'same-origin');
    assert.match(response.headers.get('permissions-policy'), /camera=\(\)/);
  });
});

test('preserves a valid caller request id', async () => {
  const context = fixture();
  await withServer(context, async (base) => {
    const response = await fetch(`${base}/health`, { headers: { 'x-request-id': 'trace-123:edge' } });
    assert.equal(response.headers.get('x-request-id'), 'trace-123:edge');
  });
});

test('rejects unsafe idempotency keys before service execution', async () => {
  const context = fixture();
  await withServer(context, async (base) => {
    const response = await fetch(`${base}/v2/campaigns`, mutation('{}', { 'idempotency-key': 'unsafe command key' }));
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, 'HTTP_IDEMPOTENCY_KEY_INVALID');
  });
  assert.equal(context.calls.length, 0);
});

test('requires JSON content type for non-empty mutation bodies', async () => {
  const context = fixture();
  await withServer(context, async (base) => {
    const response = await fetch(`${base}/v2/campaigns`, mutation('{}', { 'content-type': 'text/plain' }));
    assert.equal(response.status, 415);
    assert.equal((await response.json()).error.code, 'HTTP_CONTENT_TYPE_UNSUPPORTED');
  });
  assert.equal(context.calls.length, 0);
});

test('requires mutation bodies to be JSON objects', async () => {
  const context = fixture();
  await withServer(context, async (base) => {
    const response = await fetch(`${base}/v2/campaigns`, mutation('[]'));
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, 'HTTP_JSON_OBJECT_REQUIRED');
  });
  assert.equal(context.calls.length, 0);
});

test('accepts structured vendor JSON media types', async () => {
  const context = fixture();
  await withServer(context, async (base) => {
    const response = await fetch(`${base}/v2/campaigns`, mutation('{"name":"FW27"}', { 'content-type': 'application/vnd.syntha+json; charset=utf-8' }));
    assert.equal(response.status, 200);
  });
  assert.deepEqual(context.calls[0], ['createCampaign', 'command-1', 'user-1', { name: 'FW27' }]);
});

test('rejects malformed UTF-8 JSON', async () => {
  const context = fixture();
  await withServer(context, async (base) => {
    const response = await fetch(`${base}/v2/campaigns`, mutation(new Uint8Array([0xff])));
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, 'HTTP_JSON_INVALID');
  });
  assert.equal(context.calls.length, 0);
});
