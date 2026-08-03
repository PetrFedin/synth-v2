import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('the Syntha shell loads V4 after every earlier Omnidata layer', async () => {
  const html = await source('public/index.html');
  const build = 'visual-20260803-4';
  assert.match(html, new RegExp(`<meta name="syntha-build" content="${build}">`));
  for (const file of ['omnidata.css', 'omnidata-fidelity.css', 'omnidata-v3.css', 'omnidata-v4.css']) {
    assert.match(html, new RegExp(`<link rel="stylesheet" href="\\/${file.replace('.', '\\.')}\\?v=${build}">`));
  }

  const baseStyleIndex = html.indexOf(`/omnidata.css?v=${build}`);
  const fidelityStyleIndex = html.indexOf(`/omnidata-fidelity.css?v=${build}`);
  const v3StyleIndex = html.indexOf(`/omnidata-v3.css?v=${build}`);
  const v4StyleIndex = html.indexOf(`/omnidata-v4.css?v=${build}`);
  const formIndex = html.indexOf('/ui/open-form.js');
  const workspaceIndex = html.indexOf(`/ui/omnidata-workspace.js?v=${build}`);
  const fidelityIndex = html.indexOf(`/ui/omnidata-fidelity.js?v=${build}`);
  const v4Index = html.indexOf(`/ui/omnidata-v4.js?v=${build}`);
  const startIndex = html.indexOf('/ui/app-start.js');

  assert.ok(baseStyleIndex >= 0 && baseStyleIndex < fidelityStyleIndex);
  assert.ok(fidelityStyleIndex < v3StyleIndex);
  assert.ok(v3StyleIndex < v4StyleIndex);
  assert.ok(formIndex >= 0 && formIndex < workspaceIndex);
  assert.ok(workspaceIndex < fidelityIndex);
  assert.ok(fidelityIndex < v4Index);
  assert.ok(v4Index < startIndex);
});

test('the Omnidata layer provides tabs, KPI density, registries and a persistent inspector', async () => {
  const css = await source('public/omnidata.css');
  for (const selector of [
    '.od-tabs',
    '.od-metrics',
    '.od-commandbar',
    '.od-master-detail',
    '.od-table',
    '.od-table-row.selected',
    '.od-inspector',
    '.od-inspector-tabs',
    '.od-process-board',
    '.od-timeline',
  ]) assert.match(css, new RegExp(selector.replaceAll('.', '\\.')));
  assert.match(css, /grid-template-columns:\s*minmax\(0, 1fr\) minmax\(320px, 380px\)/);
  assert.match(css, /position:\s*sticky/);
  assert.match(css, /box-shadow:\s*inset 3px 0 0 var\(--accent\)/);
});

test('every current workspace is rebuilt through the Omnidata table-first system', async () => {
  const js = await source('public/modules/omnidata-workspace.js');
  for (const primitive of ['odTabs', 'odMetrics', 'odHeader', 'odTable', 'odInspector', 'odRegistry', 'odProgress']) {
    assert.match(js, new RegExp(`function ${primitive}\\(`));
  }
  for (const renderer of ['renderOverview', 'renderCatalog', 'renderShowrooms', 'renderPartners', 'renderSelections', 'renderOrders', 'renderCalendar', 'renderNotifications']) {
    assert.match(js, new RegExp(`function ${renderer}\\(`));
  }
  assert.match(js, /expectedVersion:\s*item\.version/);
  assert.match(js, /catalogEditActionButton/);
  assert.doesNotMatch(js, /\bstyle\s*=/);
  assert.doesNotMatch(js, /\.style\./);
  assert.doesNotMatch(js, /#[0-9a-fA-F]{3,8}\b/);
});
