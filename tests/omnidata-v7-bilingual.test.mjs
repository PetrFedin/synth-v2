import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('Syntha Omnidata V7 uses the approved reference palette and geometry', async () => {
  const css = await source('public/omnidata-v7.css');
  const bomCss = await source('public/omnidata-v7-bom.css');
  for (const token of [
    '--od7-canvas: #f6f7fb',
    '--od7-surface: #ffffff',
    '--od7-sidebar: #101a2e',
    '--od7-text: #252938',
    '--od7-accent: #5d39cf',
    '--od7-accent-soft: #f0edff',
    '--od7-sidebar-width: 200px',
    '--od7-topbar-height: 59px',
    '--od7-tabs-height: 43px',
    '--od7-control-height: 34px',
  ]) assert.ok(css.includes(token), token);

  assert.match(css, /body\.omnidata-v7\s*\{[^}]*font-size:\s*11px/s);
  assert.match(css, /\.od-master-detail\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(420px, 455px\)/s);
  assert.match(css, /\.od-table td,[\s\S]*?height:\s*72px/);
  assert.match(css, /\.od-inspector\s*\{[^}]*top:\s*69px/s);
  assert.match(css, /\.od-v7-language-switcher\s*\{[^}]*height:\s*27px/s);
  assert.match(css, /\.od-v7-system-footer\s*\{[^}]*height:\s*38px/s);
  assert.match(bomCss, /\.bom-layout\s*\{[^}]*minmax\(420px, 455px\)/s);
  assert.match(bomCss, /\.bom-table td\s*\{[^}]*height:\s*72px/s);
  assert.match(bomCss, /\.bom-inspector\s*\{[^}]*top:\s*69px/s);
  assert.doesNotMatch(`${css}\n${bomCss}`, /@import|https?:\/\/|url\s*\(/i);
});

test('V7 navigation has separate complete Russian and English terminology', async () => {
  const js = await source('public/modules/omnidata-v7.js');

  for (const escapedRussian of [
    '\\u0420\\u0410\\u0417\\u0420\\u0410\\u0411\\u041e\\u0422\\u041a\\u0410 \\u041f\\u0420\\u041e\\u0414\\u0423\\u041a\\u0422\\u0410',
    '\\u041c\\u043e\\u0434\\u0435\\u043b\\u0438 \\u0438 \\u0446\\u0432\\u0435\\u0442\\u043e\\u0432\\u044b\\u0435 \\u0432\\u0430\\u0440\\u0438\\u0430\\u043d\\u0442\\u044b',
    '\\u041c\\u0430\\u0442\\u0435\\u0440\\u0438\\u0430\\u043b\\u044b \\u0438 \\u0444\\u0443\\u0440\\u043d\\u0438\\u0442\\u0443\\u0440\\u0430',
    '\\u041e\\u043f\\u0442\\u043e\\u0432\\u044b\\u0435 \\u0437\\u0430\\u043a\\u0430\\u0437\\u044b',
    '\\u041f\\u043e\\u0432\\u0442\\u043e\\u0440\\u043d\\u044b\\u0435 \\u0437\\u0430\\u043a\\u0430\\u0437\\u044b',
  ]) assert.ok(js.includes(escapedRussian), escapedRussian);

  for (const english of [
    'PRODUCT DEVELOPMENT',
    'SOURCING AND PRODUCTION',
    'WHOLESALE COMMERCE',
    'Styles and colourways',
    'Materials and trims',
    'BOM and costing',
    'Measurement charts',
    'Wholesale orders',
    'Prices and terms',
  ]) assert.ok(js.includes(english), english);

  for (const forbiddenMixedRussian of [
    "ru: 'Line Plan'",
    "ru: 'Wholesale Orders'",
    "ru: 'Reorders'",
    "ru: 'Payments'",
    "ru: 'B2B Showroom'",
    "ru: 'Linesheets'",
    'ru: \'\\u041c\\u0430\\u0442\\u0435\\u0440\\u0438\\u0430\\u043b\\u044b / Trims\'',
    'ru: \'\\u041c\\u043e\\u0434\\u0435\\u043b\\u0438 \\u0438 colorways\'',
  ]) assert.doesNotMatch(js, new RegExp(forbiddenMixedRussian.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

  assert.doesNotMatch(js, /en:\s*'[^']*\\u04/i);
  assert.match(js, /function odV7LanguageSwitcher\(/);
  assert.match(js, /function odV7Navigation\(/);
  assert.match(js, /function odV7Role\(/);
  assert.match(js, /function applyOmnidataV7\(/);
});

test('strict bilingual runtime normalizes legacy mixed terminology including BOM', async () => {
  const js = await source('public/modules/i18n-v7.js');

  for (const phrase of [
    'B2B Showroom',
    'Linesheets',
    'Wholesale Orders',
    'Reorders',
    'Payments',
    'Line Plan',
    'Measurement Chart',
    'Tech packs',
    'Deal Space',
    'Commercial pipeline',
    'Critical path',
    'BOM and production costing',
    'Create BOM',
    'Total BOMs',
    'Invalid cost snapshot',
    'BOM brand differs from SKU',
  ]) assert.ok(js.includes(phrase), phrase);

  assert.match(js, /const legacyAliases/);
  assert.match(js, /'auth\.description'/);
  assert.match(js, /'stage\.deal-space'/);
  assert.match(js, /function strictTranslate\(/);
  assert.match(js, /global\.SynthaI18n = Object\.freeze/);
  assert.doesNotMatch(js, /https?:\/\//i);
});

test('installed planning, style, material and BOM workspaces remain active in V7', async () => {
  const js = await source('public/modules/omnidata-v7-installed.js');
  for (const view of ['planning', 'styles', 'materials', 'boms']) assert.match(js, new RegExp(`'${view}'`));
  assert.match(js, /window\.SynthaPlanningCore/);
  assert.match(js, /window\.SynthaStylesCore/);
  assert.match(js, /window\.SynthaMaterialsCore/);
  assert.match(js, /window\.SynthaBomCore/);
  assert.doesNotMatch(js, /https?:\/\//i);
});
