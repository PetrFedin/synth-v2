import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { once } from 'node:events';
import { gunzipSync, brotliDecompressSync } from 'node:zlib';
import { createStandaloneHandler, negotiateEncoding } from '../src/web/static-handler.mjs';

// node:fetch transparently decodes content-encoding, which would hide the very bytes under test.
// A raw node:http request returns the response exactly as it went over the wire.
function rawRequest(base, pathname, { method = 'GET', headers = {} } = {}) {
  const url = new URL(pathname, base);
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { hostname: url.hostname, port: url.port, path: url.pathname, method, headers },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      },
    );
    req.on('error', reject);
    req.end();
  });
}

async function withServer(work) {
  const server = createServer(createStandaloneHandler({ apiHandler: (_req, res) => { res.statusCode = 404; res.end('{}'); } }));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try { return await work(`http://127.0.0.1:${server.address().port}`); }
  finally { server.close(); await once(server, 'close'); }
}

test('a large text asset is served gzip-encoded and decodes to the original bytes', async () => {
  await withServer(async (base) => {
    const identity = await rawRequest(base, '/ui/production-orders.js', { headers: { 'accept-encoding': 'identity' } });
    assert.equal(identity.headers['content-encoding'], undefined);

    const gzipped = await rawRequest(base, '/ui/production-orders.js', { headers: { 'accept-encoding': 'gzip' } });
    assert.equal(gzipped.headers['content-encoding'], 'gzip');
    assert.equal(gzipped.headers.vary, 'accept-encoding');
    assert.equal(Number(gzipped.headers['content-length']), gzipped.body.length);
    assert.ok(gzipped.body.length < identity.body.length, `compressed ${gzipped.body.length} must be smaller than ${identity.body.length}`);
    assert.deepEqual(gunzipSync(gzipped.body), identity.body);
  });
});

test('brotli is preferred when both encodings are acceptable, and beats gzip here', async () => {
  await withServer(async (base) => {
    const identity = await rawRequest(base, '/ui/production-orders.js', { headers: { 'accept-encoding': 'identity' } });
    const gzipped = await rawRequest(base, '/ui/production-orders.js', { headers: { 'accept-encoding': 'gzip' } });
    const brotli = await rawRequest(base, '/ui/production-orders.js', { headers: { 'accept-encoding': 'gzip, br' } });

    assert.equal(brotli.headers['content-encoding'], 'br');
    assert.deepEqual(brotliDecompressSync(brotli.body), identity.body);
    assert.ok(brotli.body.length < gzipped.body.length);
  });
});

test('each representation carries its own ETag and revalidates independently', async () => {
  await withServer(async (base) => {
    const identity = await rawRequest(base, '/ui/production-orders.js', { headers: { 'accept-encoding': 'identity' } });
    const gzipped = await rawRequest(base, '/ui/production-orders.js', { headers: { 'accept-encoding': 'gzip' } });
    const identityTag = identity.headers.etag;
    const gzipTag = gzipped.headers.etag;
    assert.ok(identityTag && gzipTag);
    assert.notEqual(identityTag, gzipTag, 'a cache holding one representation must not answer for the other');

    const revalidated = await rawRequest(base, '/ui/production-orders.js', { headers: { 'accept-encoding': 'gzip', 'if-none-match': gzipTag } });
    assert.equal(revalidated.status, 304);

    const mismatched = await rawRequest(base, '/ui/production-orders.js', { headers: { 'accept-encoding': 'gzip', 'if-none-match': identityTag } });
    assert.equal(mismatched.status, 200);
  });
});

test('negotiation honours quality values and the identity default', () => {
  const type = 'text/javascript; charset=utf-8';
  const big = 4096;
  assert.equal(negotiateEncoding('gzip, br', type, big), 'br');
  assert.equal(negotiateEncoding('gzip', type, big), 'gzip');
  assert.equal(negotiateEncoding('br;q=0, gzip', type, big), 'gzip');
  assert.equal(negotiateEncoding('gzip;q=0', type, big), null);
  assert.equal(negotiateEncoding('', type, big), null);
  assert.equal(negotiateEncoding(undefined, type, big), null);
  assert.equal(negotiateEncoding('*', type, big), 'br');
});

test('small assets and non-text assets are never compressed', () => {
  assert.equal(negotiateEncoding('gzip, br', 'text/javascript; charset=utf-8', 512), null);
  assert.equal(negotiateEncoding('gzip, br', 'image/png', 100_000), null);
  assert.equal(negotiateEncoding('gzip, br', 'font/woff2', 100_000), null);
  assert.equal(negotiateEncoding('gzip, br', 'text/css; charset=utf-8', 100_000), 'br');
});

test('HEAD reports the encoded length without a body', async () => {
  await withServer(async (base) => {
    const head = await rawRequest(base, '/ui/production-orders.js', { method: 'HEAD', headers: { 'accept-encoding': 'gzip' } });
    const get = await rawRequest(base, '/ui/production-orders.js', { headers: { 'accept-encoding': 'gzip' } });
    assert.equal(head.headers['content-encoding'], 'gzip');
    assert.equal(head.headers['content-length'], get.headers['content-length']);
    assert.equal(head.body.length, 0);
  });
});
