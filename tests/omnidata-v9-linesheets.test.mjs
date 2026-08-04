import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('Omnidata V9 matches the supplied Linesheets reference geometry', async () => {
  const css = await source('public/omnidata-v9.css');

  for (const token of [
    '--od9-canvas: #f5f6fa',
    '--od9-surface: #ffffff',
    '--od9-sidebar: #101a2e',
    '--od9-text: #242938',
    '--od9-accent: #6040d0',
    '--od9-accent-soft: #f1eeff',
    '--od9-selected: #f1efff',
  ]) assert.ok(css.includes(token), token);

  assert.match(css, /body\.omnidata-v9\s*\{[^}]*font-size:\s*12px/s);
  assert.match(css, /\.ls9-tabs\s*\{[^}]*min-height:\s*43px/s);
  assert.match(css, /\.ls9-commandbar\s*\{[^}]*min-height:\s*56px/s);
  assert.match(css, /\.ls9-layout\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(420px, 455px\)/s);
  assert.match(css, /\.ls9-table td\s*\{[^}]*height:\s*72px/s);
  assert.match(css, /\.ls9-row\.selected\s*\{[^}]*background:\s*var\(--od9-selected\)[^}]*inset 2px 0 0 var\(--od9-accent\)/s);
  assert.match(css, /\.ls9-inspector\s*\{[^}]*top:\s*69px/s);
  assert.match(css, /\.ls9-gallery\s*\{[^}]*grid-template-columns:\s*repeat\(6, minmax\(0, 1fr\)\)/s);
  assert.match(css, /\.ls9-info-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/s);
  assert.match(css, /\.od-v7-system-footer\s*\{[^}]*left:\s*204px[^}]*height:\s*38px/s);
  assert.doesNotMatch(css, /@import|https?:\/\/|url\s*\(/i);
});

test('Linesheets uses grounded Syntha workspace data and a clearly marked sample fallback', async () => {
  const js = await source('public/modules/linesheets.js');
  assert.doesNotThrow(() => new Function(js));

  for (const dataSource of [
    'state.workspace.collections',
    'state.workspace.catalogSkus',
    'state.workspace.selections',
    'state.workspace.organisations',
  ]) assert.ok(js.includes(dataSource), dataSource);

  for (const functionName of [
    'collectionStatus',
    'collectionSeason',
    'organisationById',
    'buyerFor',
    'buildRows',
    'sampleRows',
    'filteredRows',
    'tableRow',
    'registry',
    'inspector',
    'renderLinesheets',
  ]) assert.match(js, new RegExp(`function ${functionName}\\(`), functionName);

  for (const phrase of [
    'Лист коллекции',
    'Linesheets',
    'Карта связей',
    'Relationship map',
    'Покупатель / Ретейл',
    'Buyer / Retailer',
    'Связанные данные',
    'Related data',
    'Примерный режим',
    'Sample mode',
    'Не назначен',
    'Not assigned',
    'Не указан',
    'Not specified',
  ]) assert.ok(js.includes(phrase), phrase);

  assert.match(js, /return 'draft';/);
  assert.match(js, /collection\.views \?\? collection\.viewCount/);
  assert.match(js, /organisation\?\.country \|\| organisation\?\.market/);
  assert.doesNotMatch(js, /United Kingdom|France|United States|Italy|Germany|UAE/);
  assert.doesNotMatch(js, /relatedSelections\.length \* 6/);
  assert.doesNotMatch(js, /retailers\[index/);
  assert.match(js, /state\.view === 'linesheets'/);
  assert.match(js, /global\.SynthaLinesheetsWorkspace = Object\.freeze/);
  assert.doesNotMatch(js, /\bstyle\s*=/);
  assert.doesNotMatch(js, /\.style\./);
  assert.doesNotMatch(js, /https?:\/\//i);
  assert.doesNotMatch(js, /(?:\u00d0|\u00d1)[\u0080-\u00ff]/u);
});

test('Omnidata V9 applies a single RU or EN interface context after V8', async () => {
  const js = await source('public/modules/omnidata-v9.js');
  const installed = await source('public/modules/omnidata-v7-installed.js');
  assert.doesNotThrow(() => new Function(js));
  assert.doesNotThrow(() => new Function(installed));

  for (const contract of [
    "const BUILD = 'visual-20260804-9'",
    "I18N.getLocale() === 'en' ? 'en' : 'ru'",
    "document.body.classList.add('omnidata-v9')",
    "state.view !== 'linesheets'",
    "const previousRenderApp = renderApp",
    'global.SynthaOmnidataV9 = Object.freeze',
  ]) assert.ok(js.includes(contract), contract);

  for (const selector of ['.ls9-tabs', '.ls9-metrics', '.ls9-commandbar', '.ls9-table thead', '.ls9-table-footer', '.ls9-inspector']) {
    assert.ok(js.includes(`'${selector}'`), selector);
  }

  assert.match(installed, /window\.SynthaLinesheetsWorkspace/);
  assert.match(installed, /'Linesheets',[\s\S]*?'linesheets',[\s\S]*?'\\u041b\\u0438\\u0441\\u0442\\u044b/);
  assert.doesNotMatch(`${js}\n${installed}`, /https?:\/\//i);
});

test('boolean DOM runtime preserves true and false control states before first render', async () => {
  const js = await source('public/modules/dom-boolean-props.js');
  assert.doesNotThrow(() => new Function(js));
  for (const property of ['checked', 'disabled', 'required', 'selected', 'readOnly', 'multiple']) {
    assert.ok(js.includes(`'${property}'`), property);
  }
  assert.match(js, /const baseEl = global\.el/);
  assert.match(js, /typeof value === 'boolean'/);
  assert.match(js, /node\[key\] = value/);
  assert.match(js, /global\.el = createElement/);
  assert.match(js, /global\.SynthaBooleanDomProperties = Object\.freeze/);
  assert.doesNotMatch(js, /https?:\/\//i);
});