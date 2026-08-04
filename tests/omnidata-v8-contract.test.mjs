import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('Omnidata V8 calibration matches the supplied reference geometry', async () => {
  const base = await source('public/omnidata-v8.css');
  const reference = await source('public/omnidata-v8-reference.css');

  for (const token of [
    '--od8-canvas: #f7f8fc',
    '--od8-surface: #ffffff',
    '--od8-sidebar: #111c31',
    '--od8-text: #252938',
    '--od8-accent: #5d39cf',
    '--od8-accent-soft: #f0edff',
    '--od8-sidebar-width: 204px',
    '--od8-topbar-height: 59px',
    '--od8-tabs-height: 43px',
    '--od8-control-height: 34px',
    '--od8-row-height: 72px',
  ]) assert.ok(reference.includes(token), token);

  assert.match(reference, /body\.omnidata-v8\s*\{[^}]*font-size:\s*12px/s);
  assert.match(reference, /\.od-view\s*>\s*\.view-toolbar\s*\{[^}]*display:\s*none\s*!important/s);
  assert.match(reference, /\.od-status-strip\s*\{[^}]*display:\s*flex/s);
  assert.match(reference, /\.od-commandbar\s*\{[^}]*min-height:\s*57px[^}]*border-bottom:\s*1px solid/s);
  assert.match(reference, /\.od-master-detail,[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) minmax\(420px, 455px\)/);
  assert.match(reference, /\.od-table td,[\s\S]*?height:\s*var\(--od8-row-height\)/);
  assert.match(reference, /\.od-inspector,[\s\S]*?top:\s*69px/);
  assert.match(reference, /\.od-definition-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/s);
  assert.match(reference, /\.od-v7-system-footer\s*\{[^}]*height:\s*38px/s);
  assert.match(base, /body\.omnidata-v8 \.button\.primary/);
  assert.match(base, /body\.omnidata-v8 dialog::backdrop/);
  assert.match(base, /body\.omnidata-v8 \.planning-page/);
  assert.match(base, /body\.omnidata-v8 \.measurement-page/);

  assert.doesNotMatch(`${base}\n${reference}`, /@import|https?:\/\//i);
  assert.doesNotMatch(`${base}\n${reference}`, /font-family:\s*[^;]*url\(/i);
});

test('Omnidata V8 applies one strict locale to every system workspace', async () => {
  const js = await source('public/modules/omnidata-v8.js');
  assert.doesNotThrow(() => new Function(js));

  for (const view of [
    'overview',
    'planning',
    'catalog',
    'styles',
    'materials',
    'boms',
    'measurements',
    'partners',
    'showrooms',
    'selections',
    'orders',
    'calendar',
    'notifications',
  ]) assert.match(js, new RegExp(`\\b${view}:\\s*\\{`), view);

  for (const selector of [
    '.sidebar',
    '.topbar',
    '.od-table thead',
    '.planning-table thead',
    '.styles-table thead',
    '.materials-table thead',
    '.bom-table thead',
    '.measurement-table thead',
    '.bom-inspector',
    '.measurement-inspector',
    'dialog',
  ]) assert.ok(js.includes(`'${selector}'`), selector);

  for (const contract of [
    "const BUILD = 'visual-20260804-8'",
    "I18N.getLocale() === 'en' ? 'en' : 'ru'",
    "document.documentElement.lang = activeLocale",
    "document.body.dataset.locale = activeLocale",
    "document.body.classList.add('omnidata-v8')",
    "switcher.setAttribute('aria-label'",
    "button.setAttribute('lang'",
    "const previousRenderApp = renderApp",
    "window.SynthaOmnidataV8 = Object.freeze",
  ]) assert.ok(js.includes(contract), contract);

  assert.match(js, /ru:\s*\[[\s\S]*?en:\s*\[/);
  assert.match(js, /function auditLanguage\(/);
  assert.match(js, /function applyPageContext\(/);
  assert.match(js, /function applyOmnidataV8\(/);
  assert.match(js, /renderApp\s*=\s*\(\.\.\.args\)/);
  assert.doesNotMatch(js, /\bstyle\s*=/);
  assert.doesNotMatch(js, /\.style\./);
  assert.doesNotMatch(js, /https?:\/\//i);
  assert.doesNotMatch(js, /(?:\u00d0|\u00d1)[\u0080-\u00ff]/u);
});

test('Omnidata V8 is the final no-cache visual layer in the standalone shell', async () => {
  const html = await source('public/index.html');
  const handler = await source('src/web/static-handler.mjs');

  const baseCss = html.indexOf('/omnidata-v8.css?v=visual-20260804-8');
  const referenceCss = html.indexOf('/omnidata-v8-reference.css?v=visual-20260804-8');
  const audit = html.indexOf('/ui/omnidata-v7-language-audit.js?v=visual-20260804-7');
  const v8 = html.indexOf('/ui/omnidata-v8.js?v=visual-20260804-8');
  const start = html.indexOf('/ui/app-start.js');

  assert.ok(baseCss >= 0 && referenceCss > baseCss);
  assert.ok(audit >= 0 && v8 > audit && start > v8);
  assert.match(html, /meta name="syntha-build" content="visual-20260804-8"/);

  for (const route of [
    "'/omnidata-v8.css': ['omnidata-v8.css'",
    "'/omnidata-v8-reference.css': ['omnidata-v8-reference.css'",
    "'/ui/omnidata-v8.js': ['modules/omnidata-v8.js'",
  ]) assert.ok(handler.includes(route), route);

  assert.match(handler, /const VISUAL_CACHE = 'no-store'/);
});
