import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function source(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}

test('Measurement Charts is activated in the real Omnidata V7 navigation', async () => {
  const installed = await source('public/modules/omnidata-v7-installed.js');
  assert.match(installed, /window\.SynthaMeasurementCore/);
  assert.match(installed, /'Measurement charts',[\s\S]*?'measurements'/);
  assert.match(installed, /planned = false/);
});

test('Measurement UI capability matrix mirrors backend least privilege', async () => {
  const ui = await source('public/modules/ui-capabilities.js');
  const backend = await source('src/modules/access-control/public.mjs');
  for (const capability of ['measurement.read', 'measurement.manage']) {
    assert.ok(ui.includes(capability), `UI capability is missing: ${capability}`);
    assert.ok(backend.includes(capability), `Backend capability is missing: ${capability}`);
  }
  assert.match(ui, /sales:[\s\S]*?CAPABILITIES\.MEASUREMENT_READ/);
  assert.doesNotMatch(ui, /sales:[\s\S]*?CAPABILITIES\.MEASUREMENT_MANAGE[\s\S]*?\],\n    buyer:/);
});

test('Measurement renderer and complete-catalog guard load before startup', async () => {
  const html = await source('public/index.html');
  const scripts = [...html.matchAll(/<script defer src="([^"]+)"/g)].map((match) => new URL(match[1], 'http://syntha.local').pathname);
  const core = scripts.indexOf('/ui/measurement-core.js');
  const v7Installed = scripts.indexOf('/ui/omnidata-v7-installed.js');
  const workspace = scripts.indexOf('/ui/measurements.js');
  const synchronizer = scripts.indexOf('/ui/measurement-catalog-sync.js');
  const audit = scripts.indexOf('/ui/omnidata-v7-language-audit.js');
  const startup = scripts.indexOf('/ui/app-start.js');
  assert.ok(core >= 0 && core < v7Installed, 'Measurement core must exist before V7 activation');
  assert.ok(v7Installed < workspace, 'V7 navigation must be activated before the renderer wraps the view');
  assert.ok(workspace < synchronizer, 'Catalog guard must wrap the installed Measurement renderer');
  assert.ok(synchronizer < audit && audit < startup, 'Catalog guard and language audit must complete before startup');
});

test('protected static handler serves every Measurement workspace asset without caching', async () => {
  const handler = await source('src/web/static-handler.mjs');
  for (const asset of [
    '/measurements.css',
    '/measurement-sync.css',
    '/ui/measurement-core.js',
    '/ui/measurements.js',
    '/ui/measurement-catalog-sync.js',
  ]) {
    assert.ok(handler.includes(`'${asset}'`), `Static handler is missing ${asset}`);
  }
  assert.match(handler, /'\/ui\/measurements\.js': \['modules\/measurements\.js', JS, VISUAL_CACHE\]/);
});
