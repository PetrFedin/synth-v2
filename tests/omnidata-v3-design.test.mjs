import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const stylesheetUrl = new URL('../public/omnidata-v3.css', import.meta.url);

async function stylesheet() {
  return readFile(stylesheetUrl, 'utf8');
}

test('Syntha Omnidata v3 uses the approved graphite orange neutral palette', async () => {
  const css = await stylesheet();
  for (const token of [
    '--canvas: #f2f3f3',
    '--surface: #ffffff',
    '--sidebar: #353b42',
    '--text: #292b2e',
    '--accent: #e95b2a',
    '--accent-soft: #fff1eb',
    '--radius-control: 3px',
    '--radius-panel: 4px',
  ]) assert.ok(css.includes(token), token);

  assert.match(css, /font-family:\s*Inter,\s*-apple-system,\s*BlinkMacSystemFont/);
  assert.doesNotMatch(css, /@import|https?:\/\/|url\s*\(/i);
});

test('Syntha Omnidata v3 preserves dense enterprise workspace geometry', async () => {
  const css = await stylesheet();
  assert.match(css, /\.shell\s*\{[^}]*grid-template-columns:\s*218px minmax\(0, 1fr\)/s);
  assert.match(css, /\.topbar\s*\{[^}]*min-height:\s*64px/s);
  assert.match(css, /\.od-tabs\s*\{[^}]*min-height:\s*50px/s);
  assert.match(css, /\.od-master-detail\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(360px, 400px\)/s);
  assert.match(css, /\.od-table td,[\s\S]*?height:\s*64px/);
  assert.match(css, /\.button\s*\{[^}]*min-height:\s*34px/s);
  assert.match(css, /\.od-inspector\s*\{[^}]*top:\s*76px/s);
});

test('Syntha Omnidata v3 stays flat, functional and orange-accented', async () => {
  const css = await stylesheet();
  assert.match(css, /\.nav-item\.active\s*\{[^}]*background:\s*#454b51/s);
  assert.match(css, /\.nav-item\.active::before\s*\{[^}]*background:\s*var\(--accent\)/s);
  assert.match(css, /\.button\.primary\s*\{[^}]*background:\s*var\(--accent\)/s);
  assert.match(css, /\.od-table-row\.selected\s*\{[^}]*background:\s*var\(--accent-soft\)/s);
  assert.match(css, /\.od-system-footer\s*\{\s*display:\s*none;\s*\}/);
  assert.doesNotMatch(css, /#(?:5d38d2|6540da|5933ca|5030bd|101b31)\b/i);
});
