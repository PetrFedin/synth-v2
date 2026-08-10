import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = await readFile(path.join(root, 'public', 'index.html'), 'utf8');
const handler = await readFile(path.join(root, 'src', 'web', 'static-handler.mjs'), 'utf8');
const installed = await readFile(path.join(root, 'public', 'modules', 'omnidata-v7-installed.js'), 'utf8');
const capabilities = await readFile(path.join(root, 'public', 'modules', 'ui-capabilities.js'), 'utf8');
const v8 = await readFile(path.join(root, 'public', 'modules', 'omnidata-v8.js'), 'utf8');

const assets = [
  ['/ui/sample-core.js', 'public/modules/sample-core.js'],
  ['/ui/samples.js', 'public/modules/samples.js'],
  ['/ui/sample-catalog-sync.js', 'public/modules/sample-catalog-sync.js'],
];

test('every referenced Samples runtime exists and is delivered with no-store', async () => {
  for (const [url, filename] of assets) {
    await access(path.join(root, filename));
    assert.ok(html.includes(`${url}?v=industrial-20260804-2`), url);
    const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(handler, new RegExp(`'${escaped}': \\[.*VISUAL_CACHE\\]`), url);
  }
});

test('Samples local stylesheet is retired from shell and static delivery', () => {
  assert.doesNotMatch(html, /href="\/samples\.css(?:\?|\")/);
  assert.doesNotMatch(handler, /['"]\/samples\.css['"]\s*:/);
  assert.match(html, /omnidata-v14-module-adapters\.css\?v=visual-20260805-14-module-adapters-5/);
  assert.match(html, /omnidata-v14-role-system\.css\?v=visual-20260806-14-role-system-1/);
});

test('Samples V8 dependency order is core, workspace, catalog guard, language audit, V8 and startup', () => {
  const scripts = [...html.matchAll(/<script defer src="([^"]+)"/g)].map((match) => new URL(match[1], 'http://syntha.local').pathname);
  const core = scripts.indexOf('/ui/sample-core.js');
  const workspaceBase = scripts.indexOf('/ui/omnidata-workspace.js');
  const installedLayer = scripts.indexOf('/ui/omnidata-v7-installed.js');
  const samples = scripts.indexOf('/ui/samples.js');
  const guard = scripts.indexOf('/ui/sample-catalog-sync.js');
  const languageAudit = scripts.indexOf('/ui/omnidata-v7-language-audit.js');
  const v8Layer = scripts.indexOf('/ui/omnidata-v8.js');
  const startup = scripts.indexOf('/ui/app-start.js');
  assert.ok(core >= 0 && core < workspaceBase);
  assert.ok(installedLayer >= 0 && samples > installedLayer);
  assert.ok(guard > samples && languageAudit > guard && v8Layer > languageAudit && startup > v8Layer);
});

test('V8 navigation, context and browser capabilities activate Samples without role drift', () => {
  assert.match(installed, /SynthaSampleCore/);
  assert.match(installed, /'Samples'[\s\S]*?'samples'/);
  assert.match(v8, /samples:[\s\S]*?'Образцы и согласования'/);
  assert.match(v8, /'\.sample-header'/);
  assert.match(capabilities, /SAMPLE_READ:\s*'sample\.read'/);
  assert.match(capabilities, /SAMPLE_MANAGE:\s*'sample\.manage'/);
  assert.match(capabilities, /sales:[\s\S]*?CAPABILITIES\.SAMPLE_READ/);
  assert.doesNotMatch(capabilities.match(/finance:[\s\S]*?viewer:/)?.[0] || '', /SAMPLE_/);
});
