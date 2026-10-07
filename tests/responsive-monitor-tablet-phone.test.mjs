import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [html, css, runtime, core] = await Promise.all([
  readFile(new URL('../public/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../public/omnidata-v14-role-system.css', import.meta.url), 'utf8'),
  readFile(new URL('../public/modules/viewport-mode.js', import.meta.url), 'utf8'),
  readFile(new URL('../public/modules/app-core.js', import.meta.url), 'utf8'),
]);

test('explicit QA viewport modes cover monitor, tablet and phone', () => {
  assert.match(html, /viewport-mode\.js\?v=responsive-20261007-1/);
  assert.match(runtime, /\['monitor', 'tablet', 'phone'\]/);
  assert.match(css, /data-viewport-mode="monitor"/);
  assert.match(css, /data-viewport-mode="tablet"/);
  assert.match(css, /data-viewport-mode="phone"/);
});

test('phone mode uses compact top navigation and single-column operational surfaces', () => {
  assert.match(css, /data-viewport-mode="phone"[\s\S]*grid-template-columns:minmax\(0,1fr\)!important/);
  assert.match(css, /nav-label\{display:none!important\}/);
  assert.match(css, /max-width:410px!important/);
});

test('localhost sign-in offers a one-click fill and sign-in control without embedding credentials in public JS', () => {
  assert.match(core, /Внести и войти/);
  assert.match(core, /\/__local\/demo-login/);
  assert.doesNotMatch(core, /local-owner-password-2026/);
});
