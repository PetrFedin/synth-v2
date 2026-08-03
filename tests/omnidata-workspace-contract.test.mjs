import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('the Syntha shell loads strict bilingual V7 after all functional workspaces', async () => {
  const html = await source('public/index.html');
  const build = 'visual-20260804-7';
  const industrialBuild = 'industrial-20260803-3';
  const bomBuild = 'industrial-20260804-1';
  assert.match(html, new RegExp(`<meta name="syntha-build" content="${build}">`));
  assert.match(html, new RegExp(`<link rel="stylesheet" href="\\/omnidata\\.css\\?v=${build}">`));
  assert.match(html, new RegExp(`<link rel="stylesheet" href="\\/industrial-product\\.css\\?v=${industrialBuild}">`));
  assert.match(html, new RegExp(`<link rel="stylesheet" href="\\/bom\\.css\\?v=${bomBuild}">`));
  assert.match(html, new RegExp(`<link rel="stylesheet" href="\\/omnidata-v7\\.css\\?v=${build}">`));
  assert.match(html, new RegExp(`<link rel="stylesheet" href="\\/omnidata-v7-bom\\.css\\?v=${build}">`));

  for (const retiredStyle of ['omnidata-v3.css', 'omnidata-v4.css', 'omnidata-v5.css', 'omnidata-v6.css']) {
    assert.doesNotMatch(html, new RegExp(`<link[^>]+${retiredStyle.replaceAll('.', '\\.')}`));
  }

  const runtimeIndex = html.indexOf('/ui/i18n-runtime.js');
  const strictI18nIndex = html.indexOf(`/ui/i18n-v7.js?v=${build}`);
  const appCoreIndex = html.indexOf('/ui/app-core.js');
  const formIndex = html.indexOf('/ui/open-form.js');
  const planningCoreIndex = html.indexOf(`/ui/planning-core.js?v=${industrialBuild}`);
  const stylesCoreIndex = html.indexOf(`/ui/styles-core.js?v=${industrialBuild}`);
  const materialsCoreIndex = html.indexOf(`/ui/materials-core.js?v=${industrialBuild}`);
  const bomCoreIndex = html.indexOf(`/ui/bom-core.js?v=${bomBuild}`);
  const workspaceIndex = html.indexOf(`/ui/omnidata-workspace.js?v=${build}`);
  const fidelityIndex = html.indexOf(`/ui/omnidata-fidelity.js?v=${build}`);
  const v5Index = html.indexOf(`/ui/omnidata-v5.js?v=${build}`);
  const planningIndex = html.indexOf(`/ui/planning.js?v=${industrialBuild}`);
  const stylesIndex = html.indexOf(`/ui/styles.js?v=${industrialBuild}`);
  const materialsIndex = html.indexOf(`/ui/materials.js?v=${industrialBuild}`);
  const bomIndex = html.indexOf(`/ui/bom.js?v=${bomBuild}`);
  const v7Index = html.indexOf(`/ui/omnidata-v7.js?v=${build}`);
  const installedIndex = html.indexOf(`/ui/omnidata-v7-installed.js?v=${build}`);
  const auditIndex = html.indexOf(`/ui/omnidata-v7-language-audit.js?v=${build}`);
  const startIndex = html.indexOf('/ui/app-start.js');

  assert.ok(runtimeIndex >= 0 && runtimeIndex < strictI18nIndex);
  assert.ok(strictI18nIndex < appCoreIndex);
  assert.ok(formIndex >= 0 && formIndex < planningCoreIndex);
  assert.ok(planningCoreIndex < stylesCoreIndex && stylesCoreIndex < materialsCoreIndex);
  assert.ok(materialsCoreIndex < bomCoreIndex && bomCoreIndex < workspaceIndex);
  assert.ok(workspaceIndex < fidelityIndex && fidelityIndex < v5Index);
  assert.ok(v5Index < planningIndex);
  assert.ok(planningIndex < stylesIndex && stylesIndex < materialsIndex);
  assert.ok(materialsIndex < bomIndex && bomIndex < v7Index);
  assert.ok(v7Index < installedIndex && installedIndex < auditIndex);
  assert.ok(auditIndex < startIndex);
  assert.doesNotMatch(html, /\/ui\/omnidata-v4\.js/);
  assert.doesNotMatch(html, /\/ui\/omnidata-v6\.js/);
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
