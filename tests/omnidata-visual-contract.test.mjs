import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('Syntha keeps the approved Omnidata-based visual tokens', async () => {
  const css = await source('public/styles.css');

  assert.match(css, /color-scheme:\s*light/);
  assert.match(css, /--canvas:\s*#f4f5f8;/);
  assert.match(css, /--surface:\s*#ffffff;/);
  assert.match(css, /--sidebar:\s*#111a2b;/);
  assert.match(css, /--accent:\s*#6f43db;/);
  assert.match(css, /--accent-soft:\s*#f0ebff;/);
  assert.match(css, /\.sidebar\s*\{/);
  assert.match(css, /\.topbar\s*\{/);
  assert.match(css, /\.nav-item\.active\s*\{/);
});

test('the standalone shell loads only the shared Omnidata visual system', async () => {
  const html = await source('public/index.html');

  assert.match(html, /<meta name="color-scheme" content="light">/);
  assert.match(html, /<meta name="theme-color" content="#111a2b">/);
  assert.match(html, /<link rel="stylesheet" href="\/styles\.css">/);
  assert.match(html, /<title>Syntha V2 - Fashion Operating System<\/title>/);
});

test('integrated views inherit shared components instead of introducing a second design system', async () => {
  const files = [
    'public/modules/integration-subjects.js',
    'public/modules/integration-collaboration.js',
    'public/modules/integration-calendar.js',
    'public/modules/integration-views.js',
  ];

  for (const file of files) {
    const content = await source(file);
    assert.doesNotMatch(content, /\bstyle\s*=/, `${file} must not contain inline style attributes`);
    assert.doesNotMatch(content, /\.style\./, `${file} must not mutate element styles directly`);
    assert.doesNotMatch(content, /#[0-9a-fA-F]{3,8}\b/, `${file} must not define local colour tokens`);
  }

  const collaboration = await source('public/modules/integration-collaboration.js');
  const calendar = await source('public/modules/integration-calendar.js');
  const views = await source('public/modules/integration-views.js');

  assert.match(collaboration, /openForm\(/);
  assert.match(collaboration, /entity\(/);
  assert.match(collaboration, /actionButton\(/);
  assert.match(calendar, /openForm\(/);
  assert.match(calendar, /entity\(/);
  assert.match(calendar, /actionButton\(/);
  assert.match(views, /toolbar\(/);
  assert.match(views, /sectionCard\(/);
});
