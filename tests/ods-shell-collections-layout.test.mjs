import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = relativePath => readFile(path.join(root, relativePath), 'utf8');

test('ODS shell resets the obsolete collapsed preference once and keeps explicit collapse available', async () => {
  const [adapterRuntime, adapterCss] = await Promise.all([
    source('public/modules/omnidata-v14-module-adapters.js'),
    source('public/omnidata-v14-module-adapters.css'),
  ]);

  for (const token of [
    "const SHELL_LAYOUT_MIGRATION_KEY='syntha-v2-shell-layout-v2'",
    "const LEGACY_SIDEBAR_KEY='syntha-v2-sidebar-collapsed'",
    'function normalizeShell()',
    'storage.removeItem(LEGACY_SIDEBAR_KEY)',
    'state.sidebarCollapsed=false',
    "shell.dataset.odsShellLayout='readable-v2'",
    'normalizeShell();',
  ]) assert.ok(adapterRuntime.includes(token), `missing shell migration token: ${token}`);

  for (const token of [
    'grid-template-columns:232px minmax(0,1fr)!important',
    'grid-template-columns:68px minmax(0,1fr)!important',
    'grid-template-columns:208px minmax(0,1fr)!important',
    'background:var(--ods-color-sidebar,#303640)!important',
    'box-shadow:inset 3px 0 0 var(--ods-color-accent,#ff5b22)!important',
    '@media(max-width:920px)',
    '@media(max-width:720px)',
  ]) assert.ok(adapterCss.includes(token), `missing readable shell token: ${token}`);
});

test('shared entity geometry prevents collection titles and status chips from overlapping', async () => {
  const [adapterCss, catalog, views, dom] = await Promise.all([
    source('public/omnidata-v14-module-adapters.css'),
    source('public/modules/catalog.js'),
    source('public/modules/views-3.js'),
    source('public/modules/dom-1.js'),
  ]);

  assert.ok(catalog.includes('state.workspace.collections.map(collectionEntity)'), 'Collections must keep the shared entity path');
  assert.ok(views.includes('function collectionEntity(item)'), 'Collection entity renderer disappeared');
  assert.ok(views.includes('return entity(item.name, item.status'), 'Collections must use shared entity geometry');
  assert.ok(dom.includes('head.append(titleBlock, statusBadge(status))'), 'Status chip must stay inside the shared entity head');

  for (const token of [
    'body.omnidata-v14.omnidata-design-system-v1 .entity-head',
    'grid-template-columns:minmax(0,1fr) max-content!important',
    'body.omnidata-v14.omnidata-design-system-v1 .entity-head .badge',
    'position:static!important',
    'max-width:140px!important',
    'body.omnidata-v14.omnidata-design-system-v1 .meta',
    'flex-wrap:wrap!important',
    '@media(max-width:840px)',
  ]) assert.ok(adapterCss.includes(token), `missing no-overlap entity token: ${token}`);
});

test('Collections navigation remains strictly locale-driven in RU and EN', async () => {
  const navigation = await source('public/modules/omnidata-v7.js');
  assert.ok(navigation.includes("{ view: 'catalog', icon: 'catalog'"));
  assert.ok(navigation.includes("en: 'Collections'"));
  assert.ok(navigation.includes("ru: '\\u041a\\u043e\\u043b\\u043b\\u0435\\u043a\\u0446\\u0438\\u0438'"));
  assert.ok(navigation.includes('return localText(item.ru, item.en);'));
});
