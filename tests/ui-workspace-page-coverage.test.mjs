import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const files = Object.fromEntries(await Promise.all([
  'app-core.js', 'dom-1.js', 'dom-2.js', 'overview.js', 'partners.js', 'catalog.js', 'showrooms.js', 'views-2.js',
].map(async name => [name, await readFile(new URL(`../public/modules/${name}`, import.meta.url), 'utf8')])));

const sectionOwners = Object.freeze({
  relationships: 'partners.js',
  invitations: 'partners.js',
  campaigns: 'catalog.js',
  collections: 'catalog.js',
  catalogSkus: 'catalog.js',
  showrooms: 'showrooms.js',
  cycles: 'showrooms.js',
  selections: 'views-2.js',
  orders: 'views-2.js',
  deals: 'views-2.js',
  calendar: 'views-2.js',
});

test('every user-facing bounded workspace section exposes a paging control', () => {
  for (const [section, file] of Object.entries(sectionOwners)) {
    assert.match(files[file], new RegExp(`['\"]${section}['\"]`), `${section} is not connected in ${file}`);
  }
  assert.match(files['dom-1.js'], /paging\.loadNext\(pagingSection\)/);
  assert.match(files['dom-1.js'], /paging\?\.hasMore\(pagingSection\)/);
});

test('workspace paging participates in refresh logout and empty state lifecycle', () => {
  assert.match(files['app-core.js'], /workspacePaging\.abortAll\(\)/);
  assert.match(files['app-core.js'], /workspacePaging\.reset\(state\.workspace\)/);
  assert.match(files['app-core.js'], /window\.SynthaWorkspaceController = workspacePaging/);
  assert.match(files['dom-2.js'], /SynthaWorkspaceController\?\.reset\(state\.workspace\)/);
  assert.match(files['dom-2.js'], /nextCursors:\{\}/);
});

test('overview exposes bounded values as lower bounds instead of exact counts', () => {
  assert.match(files['overview.js'], /truncatedSections\?\.includes\(section\)/);
  assert.match(files['overview.js'], /`\$\{count\}\+`/);
});
