import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('Syntha keeps the approved Omnidata-based visual tokens', async () => {
  const css = await source('public/styles.css');

  assert.match(css, /color-scheme:\s*light/);
  assert.match(css, /--canvas:\s*#f4f5f8;/);
  assert.match(css, /--surface:\s*#ffffff;/);
  assert.match(css, /--sidebar:\s*#111a2b;/);
  assert.match(css, /--accent:\s*#6f43db;/);
  assert.match(css, /--accent-soft:\s*#f0ebff;/);
  assert.match(css, /\.sidebar\s*\{/);
  assert.match(css, /\.topbar\s*\{/);
  assert.match(css, /\.nav-item\.active\s*\{/);
});

test('the standalone shell loads the Omnidata composition after the shared Syntha shell', async () => {
  const html = await source('public/index.html');

  assert.match(html, /<meta name="color-scheme" content="light">/);
  assert.match(html, /<meta name="theme-color" content="#111a2b">/);
  assert.match(html, /<link rel="stylesheet" href="\/styles\.css">/);
  assert.match(html, /<link rel="stylesheet" href="\/omnidata\.css">/);
  assert.match(html, /<title>Syntha V2 - Fashion Operating System<\/title>/);

  const integrationIndex = html.indexOf('/ui/integration-views.js');
  const coreIndex = html.indexOf('/ui/omnidata-core.js');
  const viewsIndex = html.indexOf('/ui/omnidata-views.js');
  const startIndex = html.indexOf('/ui/app-start.js');
  assert.ok(integrationIndex >= 0 && integrationIndex < coreIndex);
  assert.ok(coreIndex < viewsIndex);
  assert.ok(viewsIndex < startIndex);
});

test('Omnidata layout provides tabs, table-first registries and a persistent inspector', async () => {
  const css = await source('public/omnidata.css');

  for (const selector of [
    '.omni-tabs',
    '.omni-metrics',
    '.omni-commandbar',
    '.omni-master-detail',
    '.omni-table',
    '.omni-table-row.selected',
    '.omni-inspector',
    '.omni-inspector-tabs',
    '.omni-process-board',
    '.omni-timeline',
  ]) assert.match(css, new RegExp(selector.replaceAll('.', '\\.')));

  assert.match(css, /grid-template-columns:\s*minmax\(0, 1fr\) minmax\(320px, 380px\)/);
  assert.match(css, /position:\s*sticky/);
  assert.match(css, /box-shadow:\s*inset 3px 0 0 var\(--accent\)/);
});

test('all key workspaces are rebuilt through the Omnidata registry system', async () => {
  const core = await source('public/modules/omnidata-core.js');
  const views = await source('public/modules/omnidata-views.js');

  for (const primitive of ['omniTabs', 'omniMetrics', 'omniTable', 'omniInspector', 'omniMasterDetail', 'omniProcess']) {
    if (primitive === 'omniProcess') continue;
    assert.match(core, new RegExp(`function ${primitive}\\(`));
  }
  assert.match(core, /className:\s*'omni-table-row/);
  assert.match(core, /className:\s*'omni-inspector'/);

  for (const renderer of ['renderOverview', 'renderCatalog', 'renderShowrooms', 'renderPartners', 'renderSelections', 'renderOrders', 'renderCalendar', 'renderNotifications']) {
    assert.match(views, new RegExp(`function ${renderer}\\(`));
  }
  assert.match(views, /odRegistry\(/);
  assert.match(views, /omniProcess|omni-process-board/);
  assert.match(views, /omniInspector\(/);
});

test('integrated and Omnidata views do not introduce page-local styling', async () => {
  const files = [
    'public/modules/integration-subjects.js',
    'public/modules/integration-collaboration.js',
    'public/modules/integration-calendar.js',
    'public/modules/integration-views.js',
    'public/modules/omnidata-core.js',
    'public/modules/omnidata-views.js',
  ];

  for (const file of files) {
    const content = await source(file);
    assert.doesNotMatch(content, /\bstyle\s*=/, `${file} must not contain inline style attributes`);
    assert.doesNotMatch(content, /\.style\./, `${file} must not mutate element styles directly`);
    assert.doesNotMatch(content, /#[0-9a-fA-F]{3,8}\b/, `${file} must not define local colour tokens`);
  }
});
