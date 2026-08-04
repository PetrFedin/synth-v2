import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Measurement Catalog synchronization wraps the installed workspace before startup', async () => {
  const html = await readFile(path.join(root, 'public', 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script defer src="([^"]+)"/g)].map((match) => new URL(match[1], 'http://syntha.local').pathname);
  const measurements = scripts.indexOf('/ui/measurements.js');
  const synchronizer = scripts.indexOf('/ui/measurement-catalog-sync.js');
  const startup = scripts.indexOf('/ui/app-start.js');
  assert.ok(measurements >= 0, 'Measurement workspace asset is missing');
  assert.ok(synchronizer > measurements, 'Catalog synchronizer must wrap the installed Measurement renderer');
  assert.ok(startup > synchronizer, 'Catalog synchronizer must load before application startup');
  const styles = [...html.matchAll(/<link\s+[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)].map((match) => new URL(match[1], 'http://syntha.local').pathname);
  assert.ok(styles.includes('/measurement-sync.css'));
});

test('static handler explicitly delivers Measurement Catalog synchronization assets', async () => {
  const source = await readFile(path.join(root, 'src', 'web', 'static-handler.mjs'), 'utf8');
  assert.match(source, /'\/ui\/measurement-catalog-sync\.js': \['modules\/measurement-catalog-sync\.js', JS, VISUAL_CACHE\]/);
  assert.match(source, /'\/measurement-sync\.css': \['measurement-sync\.css', 'text\/css; charset=utf-8', VISUAL_CACHE\]/);
});
