import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createWholesaleHttpHandler } from '../src/http/api.mjs';
import { createWholesaleFetchHandler } from '../src/http/fetch-api.mjs';

const MAX_BODY_BYTES = 1_024;
const CHUNK = 256;

function options() {
  return {
    authenticate: async (token) => (token === 'valid-token' ? { actorId: 'user-1' } : null),
    auth: { login: async () => ({ ok: true }), logout: async () => true },
    platform: {}, partners: {}, collaboration: {}, orders: {}, notifications: {}, workspace: {},
    maxBodyBytes: MAX_BODY_BYTES,
    nextRequestId: () => 'request-1',
  };
}

// A body sent without content-length can only be bounded while it is consumed. The counter proves
// the transport stops pulling instead of buffering the whole payload and checking afterwards.
function countingStream(totalChunks, pulled) {
  let sent = 0;
  return new ReadableStream({
    pull(controller) {
      if (sent >= totalChunks) { controller.close(); return; }
      sent += 1;
      pulled.count = sent;
      controller.enqueue(new Uint8Array(CHUNK).fill(0x61));
    },
  });
}

test('fetch transport rejects an oversized chunked body without buffering all of it', async () => {
  const pulled = { count: 0 };
  const totalChunks = 40; // 10 KiB against a 1 KiB limit
  const request = new Request('https://syntha.test/v2/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: countingStream(totalChunks, pulled),
    duplex: 'half',
  });

  const response = await createWholesaleFetchHandler(options())(request);
  const payload = await response.json();

  assert.equal(response.status, 413);
  assert.equal(payload.error.code, 'HTTP_BODY_TOO_LARGE');
  assert.ok(pulled.count < totalChunks, `stream must be cancelled early, pulled ${pulled.count} of ${totalChunks} chunks`);
});

// A live socket is deliberately avoided here: the server answers 413 and ends the response while
// the client is still uploading, and that race leaves fetch() pending in CI. The adapter contract
// is what matters, so the request is driven directly as the async iterable node:http provides.
function nodeRequest(method, path, headers, chunkSource) {
  return Object.assign(chunkSource, { method, url: path, headers });
}

function nodeResponse() {
  const captured = { headers: {}, body: '' };
  return {
    captured,
    setHeader(name, value) { captured.headers[name] = value; },
    set statusCode(value) { captured.status = value; },
    get statusCode() { return captured.status; },
    end(body) { captured.body = body; },
  };
}

async function* countingChunks(totalChunks, pulled) {
  for (let sent = 0; sent < totalChunks; sent += 1) {
    pulled.count = sent + 1;
    yield Buffer.alloc(CHUNK, 0x61);
  }
}

test('node transport rejects an oversized chunked body without draining it', async () => {
  const pulled = { count: 0 };
  const totalChunks = 40; // 10 KiB against a 1 KiB limit
  const request = nodeRequest('POST', '/v2/auth/login', { 'content-type': 'application/json' }, countingChunks(totalChunks, pulled));
  const response = nodeResponse();

  await createWholesaleHttpHandler(options())(request, response);

  assert.equal(response.captured.status, 413);
  assert.equal(JSON.parse(response.captured.body).error.code, 'HTTP_BODY_TOO_LARGE');
  assert.ok(pulled.count < totalChunks, `iteration must stop early, pulled ${pulled.count} of ${totalChunks} chunks`);
});

test('both transports still accept a body at the limit', async () => {
  const body = JSON.stringify({ email: 'a@b.co', password: 'x'.repeat(12) });
  assert.ok(Buffer.byteLength(body) <= MAX_BODY_BYTES);

  const fetchResponse = await createWholesaleFetchHandler(options())(new Request('https://syntha.test/v2/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body,
  }));
  assert.equal(fetchResponse.status, 200);

  const server = createServer(createWholesaleHttpHandler(options()));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const nodeResponse = await fetch(`http://127.0.0.1:${server.address().port}/v2/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body,
    });
    assert.equal(nodeResponse.status, 200);
  } finally {
    server.close();
    await once(server, 'close');
  }
});
