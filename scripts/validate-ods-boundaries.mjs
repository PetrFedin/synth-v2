import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');
const html = await source('public/index.html');
const staticHandler = await source('src/web/static-handler.mjs');
const roleRuntime = await source('public/modules/omnidata-v14-role-system.js');
const componentRuntime = await source('public/modules/omnidata-v14-components.js');
const finalQualityRuntime = await source('public/modules/final-quality.js');

const FOUNDATION_STYLES = new Set(['/styles.css', '/i18n.css']);
const ODS_STYLESHEET = '/omnidata-v14-role-system.css';
const LEGACY_VISUAL_DEBT = Object.freeze([
  '/omnidata.css',
  '/industrial-product.css',
  '/bom.css',
  '/omnidata-v7.css',
  '/omnidata-v7-bom.css',
  '/measurements.css',
  '/measurement-sync.css',
  '/samples.css',
  '/sourcing.css',
  '/tech-packs.css',
  '/production-orders.css',
  '/production-executions.css',
  '/omnidata-v8.css',
  '/omnidata-v8-reference.css',
  '/omnidata-v9.css',
  '/omnidata-v10.css',
  '/omnidata-v11.css',
  '/omnidata-v12.css',
  '/omnidata-v13.css',
  '/omnidata-v14.css',
  '/omnidata-v14-module-adapters.css',
  '/omnidata-v14-extensions.css'
]);
const LEGACY_VISUAL_DEBT_SET = new Set(LEGACY_VISUAL_DEBT);
const FINAL_QUALITY_ODS_PARTS = Object.freeze({
  'final-quality-header': 'page-header',
  'final-quality-kpis': 'metrics',
  'final-quality-kpi': 'metric',
  'final-quality-layout': 'master-detail',
  'final-quality-grid': 'layout',
  'final-quality-facts': 'definition-grid',
  'final-quality-runs': 'list',
  'final-quality-run': 'list-item',
  'final-quality-card': 'card',
  'final-quality-filters': 'filterbar',
  'final-quality-actions': 'toolbar',
  'final-quality-create': 'header-toolbar',
  'final-quality-registry': 'table-wrap',
  'final-quality-table': 'table',
  'final-quality-inspector': 'inspector',
  'final-quality-badge': 'status',
  'final-quality-recommendation': 'status',
  'final-quality-release': 'status',
  'final-quality-error': 'alert'
});
const FORBIDDEN_DYNAMIC_STYLE_APIS = Object.freeze([
  Object.freeze({ label: 'element.style', pattern: /\.\s*style\s*(?:\.|\[|=)/ }),
  Object.freeze({ label: 'setAttribute(style)', pattern: /setAttribute\s*\(\s*['"]style['"]/ }),
  Object.freeze({ label: 'createElement(style)', pattern: /createElement\s*\(\s*['"]style['"]/ }),
  Object.freeze({ label: 'CSSStyleSheet', pattern: /\bCSSStyleSheet\b/ }),
  Object.freeze({ label: 'adoptedStyleSheets', pattern: /\badoptedStyleSheets\b/ }),
  Object.freeze({ label: 'insertRule', pattern: /\binsertRule\s*\(/ })
]);

assert(LEGACY_VISUAL_DEBT.length === 22, 'Legacy visual debt baseline must only decrease from 22 stylesheets.');

const stylesheetUrls = [...html.matchAll(/<link\s+[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)].map((match) => match[1]);
const stylesheets = stylesheetUrls.map(pathname);
assert(stylesheets.at(-1) === ODS_STYLESHEET, 'ODS must remain the final stylesheet.');
assert(!stylesheets.includes('/final-quality.css'), 'Final Quality must remain ODS-native and must not restore a local stylesheet.');
assert(!staticHandler.includes("'/final-quality.css':"), 'Final Quality local stylesheet route must not be restored.');

const unknownStyles = stylesheets.filter((item) => !FOUNDATION_STYLES.has(item) && item !== ODS_STYLESHEET && !LEGACY_VISUAL_DEBT_SET.has(item));
assert(unknownStyles.length === 0, `New local stylesheet layers are forbidden by ODS: ${unknownStyles.join(', ')}`);
const presentLegacyDebt = stylesheets.filter((item) => LEGACY_VISUAL_DEBT_SET.has(item));
for (const item of presentLegacyDebt) assert(stylesheets.indexOf(item) < stylesheets.indexOf(ODS_STYLESHEET), `Legacy stylesheet must remain below ODS: ${item}`);

const scriptUrls = [...html.matchAll(/<script\s+[^>]*src="([^"]+)"/g)].map((match) => match[1]);
const scripts = scriptUrls.map(pathname);
const componentIndex = scripts.indexOf('/ui/omnidata-v14-components.js');
const roleIndex = scripts.indexOf('/ui/omnidata-v14-role-system.js');
const appStartIndex = scripts.indexOf('/ui/app-start.js');
assert(componentIndex !== -1 && roleIndex !== -1 && appStartIndex !== -1, 'ODS component/runtime/app-start chain is incomplete.');
assert(componentIndex < roleIndex && roleIndex < appStartIndex, 'ODS component/runtime order is invalid.');
assert(componentRuntime.includes('semanticRoleFor'), 'Semantic component classifier is missing.');
assert(componentRuntime.includes('classifyLegacyComponents'), 'Legacy component classifier is missing.');
assert(componentRuntime.includes('auditComponents'), 'Component audit is missing.');

for (const [legacyClass, part] of Object.entries(FINAL_QUALITY_ODS_PARTS)) {
  assert(finalQualityRuntime.includes(legacyClass), `Final Quality semantic hook disappeared: ${legacyClass}`);
  assert(roleRuntime.includes(`'${legacyClass}':'${part}'`), `Final Quality is not covered by ODS semantic mapping: ${legacyClass} -> ${part}`);
}
for (const token of ['statusTone', 'dataset.odsTone', 'released', 'rejected', 'rework', 'review', 'in-progress', 'pass']) {
  assert(roleRuntime.includes(token), `Final Quality status semantics are not covered by ODS: ${token}`);
}

for (const script of scripts) {
  if (!script.startsWith('/ui/')) continue;
  const file = path.join(publicDir, 'modules', path.basename(script));
  const text = await readFile(file, 'utf8');
  for (const { label, pattern } of FORBIDDEN_DYNAMIC_STYLE_APIS) {
    assert(!pattern.test(text), `Loaded UI runtime uses forbidden dynamic styling (${label}): ${script}`);
  }
}

console.log(`ODS boundary contract OK (${presentLegacyDebt.length}/${LEGACY_VISUAL_DEBT.length} frozen legacy styles remain; Final Quality is ODS-native; no new stylesheet or dynamic style API).`);

async function source(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}

function pathname(asset) {
  return new URL(asset, 'http://syntha.local').pathname;
}

function assert(condition, message) {
  if (condition) return;
  console.error(message);
  process.exit(1);
}
