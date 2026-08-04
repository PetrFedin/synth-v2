import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function source(path) { return readFile(new URL(`../${path}`, import.meta.url), 'utf8'); }

test('Omnidata V10 calibrates the complete Syntha workspace to the reference system', async () => {
  const css = await source('public/omnidata-v10.css');
  for (const token of ['--od10-canvas: #f6f7fb','--od10-surface: #ffffff','--od10-sidebar: #111a2e','--od10-text: #262b39','--od10-accent: #6242d1','--od10-accent-soft: #f1eeff','--od10-sidebar-width: 200px','--od10-topbar-height: 58px','--od10-control-height: 34px','--od10-row-height: 72px','--od10-footer-height: 38px']) assert.ok(css.includes(token), token);
  for (const selector of ['body.omnidata-v10 .sidebar','body.omnidata-v10 .topbar','body.omnidata-v10 .button.primary','body.omnidata-v10 .od-tabs','body.omnidata-v10 .ls9-tabs','body.omnidata-v10 .planning-page','body.omnidata-v10 .styles-page','body.omnidata-v10 .materials-page','body.omnidata-v10 .bom-page','body.omnidata-v10 .measurement-page','body.omnidata-v10 .od-table','body.omnidata-v10 .ls9-table','body.omnidata-v10 .od-inspector','body.omnidata-v10 .ls9-inspector','body.omnidata-v10 dialog','body.omnidata-v10 .od-v7-system-footer']) assert.ok(css.includes(selector), selector);
  assert.match(css, /grid-template-columns:\s*minmax\(0, 1fr\) minmax\(420px, 455px\)/);
  assert.match(css, /height:\s*var\(--od10-row-height\)/);
  assert.match(css, /background:\s*var\(--od10-selected\)/);
  assert.match(css, /box-shadow:\s*inset 2px 0 0 var\(--od10-accent\)/);
  assert.doesNotMatch(css, /@import|https?:\/\//i);
});

test('Omnidata V10 enforces a strict RU or EN shell after every render', async () => {
  const js = await source('public/modules/omnidata-v10.js');
  assert.doesNotThrow(() => new Function(js));
  for (const contract of ["const BUILD = 'visual-20260804-10'","I18N.getLocale() === 'en' ? 'en' : 'ru'","document.documentElement.lang = locale()","document.body.dataset.locale = locale()","document.body.classList.add('omnidata-v10')","const previousRenderApp = renderApp","global.SynthaOmnidataV10 = Object.freeze"]) assert.ok(js.includes(contract), contract);
  assert.match(js, /Fashion Operating System/);
  assert.match(js, /Операционная система моды/);
  assert.match(js, /Search current section/);
  assert.match(js, /Поиск в текущем разделе/);
});

test('Omnidata V10 remains the calibrated system base beneath V11', async () => {
  const html = await source('public/index.html');
  const handler = await source('src/web/static-handler.mjs');
  const v9Css = html.indexOf('/omnidata-v9.css?v=visual-20260804-9');
  const v10Css = html.indexOf('/omnidata-v10.css?v=visual-20260804-10');
  const v11Css = html.indexOf('/omnidata-v11.css?v=visual-20260804-11');
  const v10Js = html.indexOf('/ui/omnidata-v10.js?v=visual-20260804-10');
  const v11Js = html.indexOf('/ui/omnidata-v11.js?v=visual-20260804-11');
  const booleanRuntime = html.indexOf('/ui/dom-boolean-props.js?v=visual-20260804-9');
  assert.ok(v9Css >= 0 && v10Css > v9Css && v11Css > v10Css);
  assert.ok(v10Js >= 0 && v11Js > v10Js && booleanRuntime > v11Js);
  assert.match(html, /meta name="syntha-build" content="visual-20260804-11"/);
  assert.ok(handler.includes("'/omnidata-v10.css': ['omnidata-v10.css'"));
  assert.ok(handler.includes("'/ui/omnidata-v10.js': ['modules/omnidata-v10.js'"));
});
