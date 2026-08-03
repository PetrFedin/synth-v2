import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('Syntha Omnidata V4 restores the approved navy and purple palette', async () => {
  const css = await source('public/omnidata-v4.css');
  for (const token of [
    '--canvas: #f6f7fb',
    '--surface: #ffffff',
    '--sidebar: #101a2f',
    '--text: #252938',
    '--accent: #5d39cf',
    '--accent-soft: #f0edff',
    '--radius-control: 5px',
    '--radius-panel: 6px',
  ]) assert.ok(css.includes(token), token);

  assert.match(css, /font-family:\s*Inter,\s*-apple-system,\s*BlinkMacSystemFont/);
  assert.doesNotMatch(css, /@import|https?:\/\/|url\s*\(/i);
});

test('Syntha Omnidata V4 matches the screenshot workspace geometry', async () => {
  const css = await source('public/omnidata-v4.css');
  assert.match(css, /\.shell\s*\{[^}]*grid-template-columns:\s*200px minmax\(0, 1fr\)/s);
  assert.match(css, /\.topbar\s*\{[^}]*min-height:\s*59px/s);
  assert.match(css, /\.od-tabs\s*\{[^}]*min-height:\s*43px/s);
  assert.match(css, /\.od-master-detail\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(390px, 430px\)/s);
  assert.match(css, /\.od-table td,[\s\S]*?height:\s*72px/);
  assert.match(css, /\.button\s*\{[^}]*min-height:\s*34px/s);
  assert.match(css, /\.od-inspector\s*\{[^}]*top:\s*69px/s);
});

test('Syntha Omnidata V4 uses purple selection and primary actions without orange remnants', async () => {
  const css = await source('public/omnidata-v4.css');
  assert.match(css, /\.nav-item\.active\s*\{[^}]*linear-gradient\(90deg, #5e3bcc 0%, #4d2d9f 100%\)/s);
  assert.match(css, /\.button\.primary\s*\{[^}]*linear-gradient\(180deg, #6742d8, #5934c7\)/s);
  assert.match(css, /\.od-table-row\.selected\s*\{[^}]*background:\s*#f2efff/s);
  assert.match(css, /\.od-system-footer\s*\{[\s\S]*display:\s*none !important/s);
  assert.doesNotMatch(css, /#(?:e95b2a|d94d1c|c94718|fff1eb)\b/i);
});

test('Syntha Omnidata V4 exposes the planned fashion operating-system module map', async () => {
  const js = await source('public/modules/omnidata-v4.js');
  for (const label of [
    'Collections',
    'Planning',
    'Materials',
    'BOM',
    'BOL',
    'Measurement Chart',
    'Suppliers',
    'RFQ and quotes',
    'Production',
    'Quality',
    'B2B Showroom',
    'Linesheets',
    'Buyers',
    'Retailers',
    'Assortments',
    'Wholesale Orders',
    'Reorders',
    'Prices and terms',
    'Payments',
  ]) assert.ok(js.includes(label), label);

  assert.match(js, /function odV4Navigation\(/);
  assert.match(js, /function odV4Topbar\(/);
  assert.match(js, /const odV4RenderApp = renderApp/);
  assert.doesNotMatch(js, /\bstyle\s*=/);
  assert.doesNotMatch(js, /\.style\./);
  assert.doesNotMatch(js, /#[0-9a-fA-F]{3,8}\b/);
});
