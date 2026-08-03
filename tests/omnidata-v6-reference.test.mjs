import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('Syntha Omnidata V6 uses the approved reference palette and compact scale', async () => {
  const css = await source('public/omnidata-v6.css');
  for (const token of [
    '--od6-canvas: #f6f7fb',
    '--od6-surface: #ffffff',
    '--od6-sidebar: #101a2e',
    '--od6-text: #252938',
    '--od6-accent: #5d39cf',
    '--od6-accent-soft: #f0edff',
    '--od6-sidebar-width: 200px',
    '--od6-topbar-height: 59px',
    '--od6-tabs-height: 43px',
    '--od6-control-height: 34px',
  ]) assert.ok(css.includes(token), token);

  assert.match(css, /body\.omnidata-v6\s*\{[^}]*font-size:\s*11px/s);
  assert.match(css, /font-family:\s*Inter,\s*-apple-system,\s*BlinkMacSystemFont/);
  assert.doesNotMatch(css, /@import|https?:\/\/|url\s*\(/i);
});

test('Syntha Omnidata V6 restores the approved registry and inspector geometry', async () => {
  const css = await source('public/omnidata-v6.css');

  assert.match(css, /\.topbar\s*\{[^}]*min-height:\s*var\(--od6-topbar-height\)/s);
  assert.match(css, /\.od-tabs\s*\{[^}]*min-height:\s*var\(--od6-tabs-height\)/s);
  assert.match(css, /\.od-master-detail\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(420px, 455px\)/s);
  assert.match(css, /\.od-table td,[\s\S]*?height:\s*72px/);
  assert.match(css, /\.od-inspector\s*\{[^}]*top:\s*69px/s);
  assert.match(css, /\.od-definition-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/s);
  assert.match(css, /\.od-v6-system-footer\s*\{[^}]*height:\s*38px/s);
});

test('Syntha Omnidata V6 removes V5 additions that do not exist in the reference', async () => {
  const css = await source('public/omnidata-v6.css');
  const js = await source('public/modules/omnidata-v6.js');

  for (const selector of [
    '.od-v5-page-context',
    '.od-v5-sidebar-search',
    '.od-v5-command-title',
    '.od-v5-inspector-section-title',
  ]) assert.match(css, new RegExp(selector.replaceAll('.', '\\.')));

  for (const primitive of [
    'odV6RemoveV5Additions',
    'odV6Topbar',
    'odV6StatusTones',
    'odV6Inspector',
    'odV6SystemFooter',
    'applyOmnidataV6',
  ]) assert.match(js, new RegExp(`function ${primitive}\\(`));

  assert.match(js, /visual-20260803-6/);
  assert.doesNotMatch(js, /\bstyle\s*=/);
  assert.doesNotMatch(js, /\.style\./);
  assert.doesNotMatch(js, /https?:\/\//i);
});