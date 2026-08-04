import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('Omnidata V10 calibrates the complete Syntha workspace to the reference system', async () => {
  const css = await source('public/omnidata-v10.css');

  for (const token of [
    '--od10-canvas: #f6f7fb',
    '--od10-surface: #ffffff',
    '--od10-sidebar: #111a2e',
    '--od10-text: #262b39',
    '--od10-accent: #6242d1',
    '--od10-accent-soft: #f1eeff',
    '--od10-sidebar-width: 200px',
    '--od10-topbar-height: 58px',
    '--od10-control-height: 34px',
    '--od10-row-height: 72px',
    '--od10-footer-height: 38px',
  ]) assert.ok(css.includes(token), token);

  for (const selector of [
    'body.omnidata-v10 .sidebar',
    'body.omnidata-v10 .topbar',
    'body.omnidata-v10 .button.primary',
    'body.omnidata-v10 .od-tabs',
    'body.omnidata-v10 .ls9-tabs',
    'body.omnidata-v10 .planning-page',
    'body.omnidata-v10 .styles-page',
    'body.omnidata-v10 .materials-page',
    'body.omnidata-v10 .bom-page',
    'body.omnidata-v10 .measurement-page',
    'body.omnidata-v10 .od-table',
    'body.omnidata-v10 .ls9-table',
    'body.omnidata-v10 .od-inspector',
    'body.omnidata-v10 .ls9-inspector',
    'body.omnidata-v10 dialog',
    'body.omnidata-v10 .od-v7-system-footer',
  ]) assert.ok(css.includes(selector), selector);

  assert.match(css, /grid-template-columns:\s*minmax\(0, 1fr\) minmax\(420px, 455px\)/);
  assert.match(css, /height:\s*var\(--od10-row-height\)/);
  assert.match(css, /background:\s*var\(--od10-selected\)/);
  assert.match(css, /box-shadow:\s*inset 2px 0 0 var\(--od10-accent\)/);
  assert.match(css, /background:\s*var\(--od10-accent\)/);
  assert.doesNotMatch(css, /@import|https?:\/\//i);
});

test('Omnidata V10 enforces a strict RU or EN shell after every render', async () => {
  const js = await source('public/modules/omnidata-v10.js');
  assert.doesNotThrow(() => new Function(js));

  for (const contract of [
    "const BUILD = 'visual-20260804-10'",
    "I18N.getLocale() === 'en' ? 'en' : 'ru'",
    "document.documentElement.lang = locale()",
    "document.body.dataset.locale = locale()",
    "document.body.classList.add('omnidata-v10')",
    "const previousRenderApp = renderApp",
    "global.SynthaOmnidataV10 = Object.freeze",
  ]) assert.ok(js.includes(contract), contract);

  for (const selector of [
    '.sidebar', '.topbar', '.breadcrumb', '.global-search', '.od-tabs', '.od-table',
    '.od-inspector', '.ls9-tabs', '.ls9-table', '.ls9-inspector', '.planning-page',
    '.styles-page', '.materials-page', '.bom-page', '.measurement-page', 'dialog', '.form-shell',
  ]) assert.ok(js.includes(`'${selector}'`), selector);

  assert.match(js, /Fashion Operating System/);
  assert.match(js, /Операционная система моды/);
  assert.match(js, /Search current section/);
  assert.match(js, /Поиск в текущем разделе/);
  assert.doesNotMatch(js, /\bstyle\s*=/);
  assert.doesNotMatch(js, /\.style\./);
  assert.doesNotMatch(js, /https?:\/\//i);
});

test('Omnidata V10 is the final no-cache visual layer', async () => {
  const html = await source('public/index.html');
  const handler = await source('src/web/static-handler.mjs');

  const v9Css = html.indexOf('/omnidata-v9.css?v=visual-20260804-9');
  const v10Css = html.indexOf('/omnidata-v10.css?v=visual-20260804-10');
  const v9Js = html.indexOf('/ui/omnidata-v9.js?v=visual-20260804-9');
  const v10Js = html.indexOf('/ui/omnidata-v10.js?v=visual-20260804-10');
  const booleanRuntime = html.indexOf('/ui/dom-boolean-props.js?v=visual-20260804-9');
  const start = html.indexOf('/ui/app-start.js');

  assert.ok(v9Css >= 0 && v10Css > v9Css);
  assert.ok(v9Js >= 0 && v10Js > v9Js && booleanRuntime > v10Js && start > booleanRuntime);
  assert.match(html, /meta name="syntha-build" content="visual-20260804-10"/);
  assert.ok(handler.includes("'/omnidata-v10.css': ['omnidata-v10.css'"));
  assert.ok(handler.includes("'/ui/omnidata-v10.js': ['modules/omnidata-v10.js'"));
  assert.match(handler, /const VISUAL_CACHE = 'no-store'/);
});
