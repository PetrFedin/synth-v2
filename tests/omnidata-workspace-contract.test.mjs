import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('the Syntha shell loads strict bilingual V10 after all functional workspaces', async () => {
  const html = await source('public/index.html');
  const build = 'visual-20260804-10';
  const v9Build = 'visual-20260804-9';
  const v8Build = 'visual-20260804-8';
  const legacyBuild = 'visual-20260804-7';
  const industrialBuild = 'industrial-20260803-3';
  const bomBuild = 'industrial-20260804-1';
  const measurementBuild = 'industrial-20260804-3';
  const sampleBuild = 'industrial-20260804-2';
  assert.match(html, new RegExp(`<meta name="syntha-build" content="${build}">`));
  assert.match(html, new RegExp(`<link rel="stylesheet" href="\\/omnidata\\.css\\?v=${legacyBuild}">`));
  assert.match(html, new RegExp(`<link rel="stylesheet" href="\\/industrial-product\\.css\\?v=${industrialBuild}">`));
  assert.match(html, new RegExp(`<link rel="stylesheet" href="\\/bom\\.css\\?v=${bomBuild}">`));
  assert.match(html, new RegExp(`<link rel="stylesheet" href="\\/measurements\\.css\\?v=${measurementBuild}">`));
  assert.match(html, new RegExp(`<link rel="stylesheet" href="\\/samples\\.css\\?v=${sampleBuild}">`));
  assert.match(html, new RegExp(`<link rel="stylesheet" href="\\/omnidata-v7\\.css\\?v=${legacyBuild}">`));
  assert.match(html, new RegExp(`<link rel="stylesheet" href="\\/omnidata-v7-bom\\.css\\?v=${legacyBuild}">`));
  assert.match(html, new RegExp(`<link rel="stylesheet" href="\\/omnidata-v8\\.css\\?v=${v8Build}">`));
  assert.match(html, new RegExp(`<link rel="stylesheet" href="\\/omnidata-v8-reference\\.css\\?v=${v8Build}">`));
  assert.match(html, new RegExp(`<link rel="stylesheet" href="\\/omnidata-v9\\.css\\?v=${v9Build}">`));
  assert.match(html, new RegExp(`<link rel="stylesheet" href="\\/omnidata-v10\\.css\\?v=${build}">`));

  for (const retiredStyle of ['omnidata-v3.css', 'omnidata-v4.css', 'omnidata-v5.css', 'omnidata-v6.css']) {
    assert.doesNotMatch(html, new RegExp(`<link[^>]+${retiredStyle.replaceAll('.', '\\.')}`));
  }

  const runtimeIndex = html.indexOf('/ui/i18n-runtime.js');
  const strictI18nIndex = html.indexOf(`/ui/i18n-v7.js?v=${legacyBuild}`);
  const appCoreIndex = html.indexOf('/ui/app-core.js');
  const formIndex = html.indexOf('/ui/open-form.js');
  const planningCoreIndex = html.indexOf(`/ui/planning-core.js?v=${industrialBuild}`);
  const stylesCoreIndex = html.indexOf(`/ui/styles-core.js?v=${industrialBuild}`);
  const materialsCoreIndex = html.indexOf(`/ui/materials-core.js?v=${industrialBuild}`);
  const bomCoreIndex = html.indexOf(`/ui/bom-core.js?v=${bomBuild}`);
  const measurementCoreIndex = html.indexOf(`/ui/measurement-core.js?v=${measurementBuild}`);
  const sampleCoreIndex = html.indexOf(`/ui/sample-core.js?v=${sampleBuild}`);
  const workspaceIndex = html.indexOf(`/ui/omnidata-workspace.js?v=${legacyBuild}`);
  const fidelityIndex = html.indexOf(`/ui/omnidata-fidelity.js?v=${legacyBuild}`);
  const v5Index = html.indexOf(`/ui/omnidata-v5.js?v=${legacyBuild}`);
  const planningIndex = html.indexOf(`/ui/planning.js?v=${industrialBuild}`);
  const stylesIndex = html.indexOf(`/ui/styles.js?v=${industrialBuild}`);
  const materialsIndex = html.indexOf(`/ui/materials.js?v=${industrialBuild}`);
  const bomIndex = html.indexOf(`/ui/bom.js?v=${bomBuild}`);
  const v7Index = html.indexOf(`/ui/omnidata-v7.js?v=${legacyBuild}`);
  const linesheetsIndex = html.indexOf(`/ui/linesheets.js?v=${v9Build}`);
  const installedIndex = html.indexOf(`/ui/omnidata-v7-installed.js?v=${v9Build}`);
  const measurementsIndex = html.indexOf(`/ui/measurements.js?v=${measurementBuild}`);
  const measurementActionsIndex = html.indexOf(`/ui/measurement-revision-actions.js?v=${measurementBuild}`);
  const measurementSyncIndex = html.indexOf(`/ui/measurement-catalog-sync.js?v=${measurementBuild}`);
  const samplesIndex = html.indexOf(`/ui/samples.js?v=${sampleBuild}`);
  const sampleSyncIndex = html.indexOf(`/ui/sample-catalog-sync.js?v=${sampleBuild}`);
  const auditIndex = html.indexOf(`/ui/omnidata-v7-language-audit.js?v=${legacyBuild}`);
  const v8Index = html.indexOf(`/ui/omnidata-v8.js?v=${v8Build}`);
  const v9Index = html.indexOf(`/ui/omnidata-v9.js?v=${v9Build}`);
  const v10Index = html.indexOf(`/ui/omnidata-v10.js?v=${build}`);
  const booleanIndex = html.indexOf(`/ui/dom-boolean-props.js?v=${v9Build}`);
  const startIndex = html.indexOf('/ui/app-start.js');

  assert.ok(runtimeIndex >= 0 && runtimeIndex < strictI18nIndex);
  assert.ok(strictI18nIndex < appCoreIndex);
  assert.ok(formIndex >= 0 && formIndex < planningCoreIndex);
  assert.ok(planningCoreIndex < stylesCoreIndex && stylesCoreIndex < materialsCoreIndex);
  assert.ok(materialsCoreIndex < bomCoreIndex && bomCoreIndex < measurementCoreIndex);
  assert.ok(measurementCoreIndex < sampleCoreIndex && sampleCoreIndex < workspaceIndex);
  assert.ok(workspaceIndex < fidelityIndex && fidelityIndex < v5Index);
  assert.ok(v5Index < planningIndex);
  assert.ok(planningIndex < stylesIndex && stylesIndex < materialsIndex);
  assert.ok(materialsIndex < bomIndex && bomIndex < v7Index);
  assert.ok(v7Index < linesheetsIndex && linesheetsIndex < installedIndex);
  assert.ok(installedIndex < measurementsIndex);
  assert.ok(measurementsIndex < measurementActionsIndex && measurementActionsIndex < measurementSyncIndex);
  assert.ok(measurementSyncIndex < samplesIndex && samplesIndex < sampleSyncIndex);
  assert.ok(sampleSyncIndex < auditIndex && auditIndex < v8Index);
  assert.ok(v8Index < v9Index && v9Index < v10Index && v10Index < booleanIndex && booleanIndex < startIndex);
  assert.doesNotMatch(html, /\/ui\/omnidata-v4\.js/);
  assert.doesNotMatch(html, /\/ui\/omnidata-v6\.js/);
});

test('the Omnidata layer provides tabs, KPI density, registries and a persistent inspector', async () => {
  const css = await source('public/omnidata.css');
  for (const selector of [
    '.od-tabs', '.od-metrics', '.od-commandbar', '.od-master-detail', '.od-table',
    '.od-table-row.selected', '.od-inspector', '.od-inspector-tabs', '.od-process-board', '.od-timeline',
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

test('Linesheets remains a working V9 workspace beneath the V10 system layer', async () => {
  const linesheets = await source('public/modules/linesheets.js');
  const installed = await source('public/modules/omnidata-v7-installed.js');
  assert.doesNotThrow(() => new Function(linesheets));
  for (const functionName of ['buildRows', 'tabs', 'metrics', 'controls', 'registry', 'inspector', 'renderLinesheets']) {
    assert.match(linesheets, new RegExp(`function ${functionName}\\(`));
  }
  assert.match(linesheets, /state\.view === 'linesheets'/);
  assert.match(linesheets, /window\.SynthaLinesheets|global\.SynthaLinesheetsWorkspace/);
  assert.match(installed, /window\.SynthaLinesheetsWorkspace/);
  assert.match(installed, /'Linesheets',[\s\S]*?'linesheets'/);
  assert.doesNotMatch(linesheets, /\bstyle\s*=/);
  assert.doesNotMatch(linesheets, /\.style\./);
  assert.doesNotMatch(linesheets, /https?:\/\//i);
});
