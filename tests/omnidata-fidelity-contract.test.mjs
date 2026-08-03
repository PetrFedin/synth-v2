import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('the high-fidelity layer loads after the structural Omnidata workspace and before startup', async () => {
  const html = await source('public/index.html');
  const baseCss = html.indexOf('/omnidata.css');
  const fidelityCss = html.indexOf('/omnidata-fidelity.css');
  const workspace = html.indexOf('/ui/omnidata-workspace.js');
  const polish = html.indexOf('/ui/omnidata-polish.js');
  const fidelity = html.indexOf('/ui/omnidata-fidelity.js');
  const start = html.indexOf('/ui/app-start.js');

  assert.ok(baseCss >= 0 && baseCss < fidelityCss);
  assert.ok(workspace >= 0 && workspace < polish);
  assert.ok(polish < fidelity && fidelity < start);
});

test('the fidelity stylesheet matches the approved Omnidata geometry and density', async () => {
  const css = await source('public/omnidata-fidelity.css');

  for (const selector of [
    '.od-status-strip',
    '.od-status-card',
    '.od-commandbar',
    '.od-view-toggle',
    '.od-table-footer',
    '.od-pagination',
    '.od-preview-gallery',
    '.od-related-data',
    '.od-system-footer',
  ]) assert.match(css, new RegExp(selector.replaceAll('.', '\\.')));

  assert.match(css, /grid-template-columns:\s*200px minmax\(0, 1fr\)/);
  assert.match(css, /\.topbar\s*\{[\s\S]*?min-height:\s*59px/);
  assert.match(css, /\.od-tabs\s*\{[\s\S]*?min-height:\s*42px/);
  assert.match(css, /\.od-table td,[\s\S]*?height:\s*72px/);
  assert.match(css, /grid-template-columns:\s*minmax\(0, 1fr\) minmax\(370px, 430px\)/);
  assert.match(css, /\.od-system-footer\s*\{[\s\S]*?height:\s*38px/);
  assert.match(css, /font-size:\s*10\.5px/);
});

test('the fidelity behavior creates dense registry and inspector controls without inline styling', async () => {
  const js = await source('public/modules/omnidata-fidelity.js');

  assert.doesNotThrow(() => new Function(js));
  for (const primitive of [
    'odFidelityStatusStrip',
    'odFidelityCommandBars',
    'odFidelityTables',
    'odFidelityInspectors',
    'odFidelitySystemFooter',
    'applyOmnidataVisualFidelity',
  ]) assert.match(js, new RegExp(`function ${primitive}\\(`));

  for (const className of [
    'od-select-control',
    'od-row-menu',
    'od-table-footer',
    'od-preview-gallery',
    'od-related-tag',
    'od-system-footer',
  ]) assert.match(js, new RegExp(className));

  assert.match(js, /renderApp\s*=\s*\(\.\.\.args\)/);
  assert.doesNotMatch(js, /\bstyle\s*=/);
  assert.doesNotMatch(js, /\.style\./);
  assert.doesNotMatch(js, /(?:\u00d0|\u00d1)[\u0080-\u00ff]/u);
});

test('the standalone server exposes both fidelity assets', async () => {
  const handler = await source('src/web/static-handler.mjs');
  assert.match(handler, /'\/omnidata-fidelity\.css':\s*\['omnidata-fidelity\.css'/);
  assert.match(handler, /'\/ui\/omnidata-fidelity\.js':\s*\['modules\/omnidata-fidelity\.js'/);
});
