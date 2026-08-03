import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('Syntha Omnidata V5 uses the approved enterprise palette and readable type scale', async () => {
  const css = await source('public/omnidata-v5.css');
  for (const token of [
    '--v5-canvas: #f3f4f7',
    '--v5-surface: #ffffff',
    '--v5-sidebar: #111a2d',
    '--v5-text: #222838',
    '--v5-accent: #6547d8',
    '--v5-accent-soft: #eeeaff',
    '--v5-sidebar-width: 232px',
    '--v5-topbar-height: 64px',
    '--v5-control-height: 36px',
  ]) assert.ok(css.includes(token), token);

  assert.match(css, /body\.omnidata-v5\s*\{[^}]*font-size:\s*13px/s);
  assert.match(css, /font-family:\s*Inter,\s*-apple-system,\s*BlinkMacSystemFont/);
  assert.match(css, /\.od-v5-context-copy h2\s*\{[^}]*font-size:\s*20px/s);
  assert.doesNotMatch(css, /@import|https?:\/\/|url\s*\(/i);
});

test('Syntha Omnidata V5 uses the target workspace geometry and hierarchy', async () => {
  const core = await source('public/omnidata-v5.css');
  const workspace = await source('public/omnidata-v5-workspace.css');
  const responsive = await source('public/omnidata-v5-responsive.css');

  assert.match(core, /\.topbar\s*\{[^}]*min-height:\s*var\(--v5-topbar-height\)/s);
  assert.match(core, /\.od-tabs\s*\{[^}]*min-height:\s*48px/s);
  assert.match(core, /\.od-v5-page-context\s*\{[^}]*min-height:\s*86px/s);
  assert.match(core, /\.od-v5-sidebar-search\s*\{/);
  assert.match(workspace, /\.od-master-detail\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(420px, 460px\)/s);
  assert.match(workspace, /\.od-table td,[\s\S]*?height:\s*66px/);
  assert.match(workspace, /\.od-inspector\s*\{[^}]*top:\s*80px/s);
  assert.match(workspace, /\.button\s*\{[^}]*min-height:\s*var\(--v5-control-height\)/s);
  assert.match(responsive, /@media \(max-width: 980px\)/);
});

test('Syntha Omnidata V5 exposes the complete planned fashion operating-system map', async () => {
  const js = await source('public/modules/omnidata-v5.js');
  for (const label of [
    'PRODUCT DEVELOPMENT',
    'SOURCING & PRODUCTION',
    'WHOLESALE COMMERCE',
    'Line Plan',
    'Styles and colourways',
    'Materials and trims',
    'BOM and Costing',
    'Measurement Charts',
    'Tech packs',
    'RFQ',
    'Quotations',
    'Production',
    'Quality',
    'Logistics',
    'Linesheets',
    'Buyers and retailers',
    'Wholesale Orders',
    'Reorders',
    'Prices and terms',
    'Payments',
    'Analytics',
    'Tasks',
  ]) assert.ok(js.includes(label), label);

  for (const primitive of [
    'odV5Navigation',
    'odV5SidebarSearch',
    'odV5Context',
    'odV5Commandbars',
    'odV5Tables',
    'odV5Inspectors',
  ]) assert.match(js, new RegExp(`function ${primitive}\\(`));

  assert.doesNotMatch(js, /\bstyle\s*=/);
  assert.doesNotMatch(js, /\.style\./);
  assert.doesNotMatch(js, /https?:\/\//i);
});
