import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('the Syntha shell loads the Omnidata layer after functional modules', async () => {
  const html = await source('public/index.html');
  assert.match(html, /<link rel="stylesheet" href="\/omnidata\.css">/);
  const formIndex = html.indexOf('/ui/open-form.js');
  const workspaceIndex = html.indexOf('/ui/omnidata-workspace.js');
  const startIndex = html.indexOf('/ui/app-start.js');
  assert.ok(formIndex >= 0 && formIndex < workspaceIndex);
  assert.ok(workspaceIndex < startIndex);
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
