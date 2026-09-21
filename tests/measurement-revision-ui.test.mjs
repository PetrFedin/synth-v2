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
  // \u041f\u0440\u0430\u0432\u0438\u043b\u043e \u0433\u0440\u0430\u0434\u0430\u0446\u0438\u0438 \u2014 \u043d\u0435 \u0432\u044b\u0432\u0435\u0434\u0435\u043d\u043d\u043e\u0435 \u043f\u043e\u043b\u0435, \u0430 \u0432\u0432\u043e\u0434 \u0430\u0432\u0442\u043e\u0440\u0430, \u0438\u0437 \u043a\u043e\u0442\u043e\u0440\u043e\u0433\u043e \u043e\u0441\u0442\u0430\u043b\u044c\u043d\u043e\u0435 \u0432\u044b\u0432\u0435\u0434\u0435\u043d\u043e.
  // \u0411\u0435\u0437 \u043d\u0435\u0433\u043e PATCH \u0447\u0438\u0442\u0430\u043b\u0441\u044f \u043a\u0430\u043a \u00ab\u043f\u0440\u0430\u0432\u0438\u043b\u0430 \u043d\u0435\u0442\u00bb \u0438 \u0433\u0440\u0430\u0434\u0443\u0438\u0440\u043e\u0432\u0430\u043d\u043d\u0430\u044f \u0442\u0430\u0431\u043b\u0438\u0446\u0430 \u0442\u0435\u0440\u044f\u043b\u0430 \u0435\u0433\u043e \u043c\u043e\u043b\u0447\u0430.
  assert.match(source.match(/function buildEditablePayload[\s\S]*?\n  \}/)?.[0] || '', /gradeSteps: Array\.isArray\(point\.gradeSteps\)/);
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
