import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = await readFile(path.join(root, 'public', 'modules', 'measurement-revision-actions.js'), 'utf8');

test('published Measurement Charts expose an explicit guarded revision action', async () => {
  assert.match(source, /chart\?\.status === 'published'/);
  assert.match(source, /CAPABILITIES\.MEASUREMENT_MANAGE/);
  assert.match(source, /data-measurement-revise|dataset\.measurementRevise/);
  assert.match(source, /Создать ревизию/);
  assert.match(source, /MEASUREMENT_CONCURRENCY_CONFLICT/);
});

test('revision payload strips all server-derived matrix fields before PATCH', async () => {
  assert.match(source, /expectedVersion: chart\.version/);
  assert.match(source, /measurements: point\.measurements\.map/);
  assert.match(source, /sizeCode: measurement\.sizeCode, value: measurement\.value/);
  assert.doesNotMatch(source.match(/function buildEditablePayload[\s\S]*?\n  \}/)?.[0] || '', /deltaFromPrevious/);
  assert.match(source, /mutate\(`\/v2\/measurements\/\$\{encodeURIComponent\(chart\.sku\)\}`,[\s\S]*?'PATCH'\)/);
});

test('revision action is delivered between Measurement workspace installation and catalog guard', async () => {
  const html = await readFile(path.join(root, 'public', 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script defer src="([^"]+)"/g)].map((match) => new URL(match[1], 'http://syntha.local').pathname);
  const workspace = scripts.indexOf('/ui/measurements.js');
  const revision = scripts.indexOf('/ui/measurement-revision-actions.js');
  const catalogGuard = scripts.indexOf('/ui/measurement-catalog-sync.js');
  assert.ok(workspace >= 0 && revision > workspace && catalogGuard > revision);
  const handler = await readFile(path.join(root, 'src', 'web', 'static-handler.mjs'), 'utf8');
  assert.match(handler, /'\/ui\/measurement-revision-actions\.js': \['modules\/measurement-revision-actions\.js', JS, VISUAL_CACHE\]/);
});
