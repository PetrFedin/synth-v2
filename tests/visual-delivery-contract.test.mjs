import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createStandaloneHandler } from '../src/web/static-handler.mjs';

const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const build = 'visual-20260803-5';

async function withServer(handler, work) {
  const server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    await work(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

test('the shell versions every Syntha Omnidata V5 visual asset', async () => {
  const html = await readFile(path.join(publicDir, 'index.html'), 'utf8');
  assert.match(html, new RegExp(`meta name="syntha-build" content="${build}"`));
  for (const asset of [
    'omnidata.css',
    'omnidata-fidelity.css',
    'omnidata-v3.css',
    'omnidata-v4.css',
    'omnidata-v5.css',
    'omnidata-v5-workspace.css',
    'omnidata-v5-responsive.css',
    'omnidata-workspace.js',
    'omnidata-polish.js',
    'omnidata-fidelity.js',
    'omnidata-v4.js',
    'omnidata-v5.js',
  ]) assert.match(html, new RegExp(`${asset.replaceAll('.', '\\.')}\\?v=${build}`));
});

test('the standalone server prevents stale caching of every visual asset', async () => {
  const handler = createStandaloneHandler({
    publicDir,
    apiHandler: (_request, response) => {
      response.statusCode = 404;
      response.end();
    },
  });

  await withServer(handler, async (base) => {
    for (const asset of [
      `/omnidata.css?v=${build}`,
      `/omnidata-fidelity.css?v=${build}`,
      `/omnidata-v3.css?v=${build}`,
      `/omnidata-v4.css?v=${build}`,
      `/omnidata-v5.css?v=${build}`,
      `/omnidata-v5-workspace.css?v=${build}`,
      `/omnidata-v5-responsive.css?v=${build}`,
      `/ui/omnidata-workspace.js?v=${build}`,
      `/ui/omnidata-polish.js?v=${build}`,
      `/ui/omnidata-fidelity.js?v=${build}`,
      `/ui/omnidata-v4.js?v=${build}`,
      `/ui/omnidata-v5.js?v=${build}`,
    ]) {
      const response = await fetch(`${base}${asset}`);
      assert.equal(response.status, 200, asset);
      assert.equal(response.headers.get('cache-control'), 'no-store', asset);
    }
  });
});
