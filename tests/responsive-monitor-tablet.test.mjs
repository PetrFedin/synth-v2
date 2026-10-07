import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [html, css, runtime] = await Promise.all([
  readFile(new URL('../public/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../public/omnidata-v14-role-system.css', import.meta.url), 'utf8'),
  readFile(new URL('../public/modules/viewport-mode.js', import.meta.url), 'utf8'),
]);

test('monitor and tablet review modes are explicit cache-busted assets', () => {
  assert.match(html, /viewport-mode\.js\?v=responsive-20261007-1/);
  assert.match(runtime, /\['monitor', 'tablet', 'phone'\]\.includes\(requested\)/);
});

test('tablet preview preserves a left collapsible sidebar instead of mobile top navigation', () => {
  assert.match(css, /data-viewport-mode="tablet"[\s\S]*grid-template-columns: 176px minmax\(0, 1fr\)/);
  assert.match(css, /shell\.sidebar-collapsed[\s\S]*grid-template-columns: 62px minmax\(0, 1fr\)/);
  assert.match(css, /height: 100vh !important/);
  assert.match(css, /flex-direction: column !important/);
});

test('tablet actions stay content-sized and touchable rather than stretching across the page', () => {
  assert.match(css, /width: auto !important/);
  assert.match(css, /min-height: 38px !important/);
  assert.match(css, /max-width: min\(100%, 280px\) !important/);
});
