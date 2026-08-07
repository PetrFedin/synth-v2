import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = await source('public/index.html');
const css = await source('public/omnidata-v14-role-system.css');
const runtime = await source('public/modules/omnidata-v14-role-system.js');
const staticHandler = await source('src/web/static-handler.mjs');

const DESIGN_SYSTEM = 'omnidata-design-system-v1';
const VERSION = '1.0.0';
const RUNTIME_BUILD = 'visual-20260806-14-role-system-1';
const ROLES = ['table', 'filterbar', 'card', 'status', 'inspector', 'button', 'field'];
const PARTS = [
  'page-header', 'table-wrap', 'table', 'filterbar', 'toolbar', 'header-toolbar',
  'section-head', 'tabs', 'pagination', 'breadcrumb', 'card', 'surface', 'form',
  'metrics', 'metric', 'layout', 'master-detail', 'list', 'list-item',
  'definition-grid', 'definition-item', 'timeline', 'timeline-item', 'progress',
  'progress-track', 'progress-fill', 'empty', 'alert', 'toast'
];
const CRITICAL_STYLED_PARTS = [
  'page-header', 'table-wrap', 'filterbar', 'toolbar', 'card', 'surface', 'form',
  'metrics', 'metric', 'layout', 'master-detail', 'list', 'list-item',
  'definition-grid', 'definition-item', 'timeline', 'timeline-item', 'progress',
  'progress-track', 'progress-fill', 'empty', 'alert'
];
const TOKENS = [
  '--ods-font-family', '--ods-font-size-xs', '--ods-font-size-sm', '--ods-font-size-md',
  '--ods-font-size-lg', '--ods-font-size-xl', '--ods-color-workspace',
  '--ods-color-sidebar', '--ods-color-surface', '--ods-color-surface-soft',
  '--ods-color-text', '--ods-color-text-soft', '--ods-color-muted',
  '--ods-color-border', '--ods-color-border-strong', '--ods-color-accent',
  '--ods-color-accent-hover', '--ods-color-success', '--ods-color-warning',
  '--ods-color-danger', '--ods-color-info', '--ods-space-1', '--ods-space-2',
  '--ods-space-3', '--ods-space-4', '--ods-space-5', '--ods-space-6',
  '--ods-control-height', '--ods-row-height', '--ods-radius-sm', '--ods-radius-md',
  '--ods-radius-lg', '--ods-content-max', '--ods-inspector-width'
];
const WORKSPACE_STYLES = [
  '/industrial-product.css', '/bom.css', '/measurements.css', '/samples.css',
  '/sourcing.css', '/tech-packs.css', '/production-orders.css',
  '/production-executions.css', '/final-quality.css'
];
const WORKSPACE_SCRIPTS = [
  '/ui/planning.js', '/ui/bom.js', '/ui/measurements.js', '/ui/samples.js',
  '/ui/sourcing.js', '/ui/tech-packs.js', '/ui/production-orders.js',
  '/ui/production-executions.js', '/ui/final-quality.js'
];

assert(html.includes(`<meta name="syntha-design-system" content="${DESIGN_SYSTEM}">`), 'Design-system metadata is missing.');
assert(html.includes(`<meta name="syntha-design-system-version" content="${VERSION}">`), 'Design-system version metadata is missing.');
assert(html.includes(`/omnidata-v14-role-system.css?v=${RUNTIME_BUILD}`), 'ODS stylesheet cache key is missing.');
assert(html.includes(`/ui/omnidata-v14-role-system.js?v=${RUNTIME_BUILD}`), 'ODS runtime cache key is missing.');

const stylesheetUrls = [...html.matchAll(/<link\s+[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)].map((match) => match[1]);
const stylesheets = stylesheetUrls.map(pathname);
const scriptUrls = [...html.matchAll(/<script\s+[^>]*defer[^>]*src="([^"]+)"/g)].map((match) => match[1]);
const scripts = scriptUrls.map(pathname);

assert(stylesheets.at(-1) === '/omnidata-v14-role-system.css', 'ODS stylesheet must remain the final stylesheet.');
assert(scripts.at(-1) === '/ui/app-start.js', 'app-start.js must remain the final script.');
const runtimeIndex = scripts.indexOf('/ui/omnidata-v14-role-system.js');
const normalizerIndex = scripts.indexOf('/ui/dom-boolean-props.js');
const appStartIndex = scripts.indexOf('/ui/app-start.js');
assert(runtimeIndex !== -1, 'ODS runtime is missing.');
assert(runtimeIndex < normalizerIndex && normalizerIndex < appStartIndex, 'ODS runtime order is invalid.');
for (const workspace of WORKSPACE_STYLES) assert(stylesheets.indexOf(workspace) < stylesheets.length - 1, `Workspace stylesheet must load below ODS: ${workspace}`);
for (const workspace of WORKSPACE_SCRIPTS) assert(scripts.indexOf(workspace) < runtimeIndex, `Workspace runtime must load before ODS: ${workspace}`);

for (const token of TOKENS) assert(css.includes(`${token}:`), `Missing ODS token: ${token}`);
for (const token of ['--odr-bg:', '--odr-sidebar:', '--odr-accent:', '--odr-control-height:', '--odr-row-height:', '--odr-radius:']) {
  assert(css.includes(token), `Missing backward-compatible token alias: ${token}`);
}
for (const role of ROLES) {
  assert(runtime.includes(`'${role}'`), `Missing runtime role: ${role}`);
  assert(css.includes(`[data-ods-role="${role}"]`), `Missing ODS role selector: ${role}`);
  assert(css.includes(`[data-od14-unified-role="${role}"]`), `Missing compatibility role selector: ${role}`);
}
for (const part of PARTS) {
  assert(runtime.includes(`'${part}'`) || runtime.includes(`:${part}`), `Missing runtime part: ${part}`);
}
const styledParts = new Set([...css.matchAll(/data-ods-part="([^"]+)"/g)].map((match) => match[1]));
for (const part of CRITICAL_STYLED_PARTS) assert(styledParts.has(part), `Missing critical ODS styled part: ${part}`);
assert(styledParts.size >= 20, `ODS structural coverage is too small: ${styledParts.size} styled parts.`);

for (const token of [
  `const DESIGN_SYSTEM='${DESIGN_SYSTEM}'`,
  `const VERSION='${VERSION}'`,
  "const CORE_ROLES=Object.freeze(['table','filterbar','card','status','inspector','button','field'])",
  'COMPONENT_TO_ROLE', 'COMPONENT_PART', 'EXPLICIT_SELECTORS', 'EXACT_PARTS',
  'CLASS_RULES', 'data-ods-role', 'data-ods-part', 'STRICT_PAIRS', 'RU_ALIASES',
  'EN_ALIASES', 'translateAliases', 'auditMixedLanguage', 'translateInterface',
  'decorateAbbreviations', 'auditLanguage', 'syntha:locale-changed', 'MutationObserver',
  'SynthaOmnidataDesignSystemV1', 'SynthaOmnidataV14RoleSystem', 'odsLanguageAudit'
]) assert(runtime.includes(token), `Missing ODS runtime contract: ${token}`);

assert(!/@import|https?:\/\//i.test(css), 'ODS CSS must be self-contained.');
assert(!/:has\(/.test(css), 'ODS CSS must not depend on :has().');
assert(!/\.(?:tech-pack|production-orders|production-execution|final-quality|measurement-|sample-|sourcing-|bom-|ls9-)/i.test(css), 'ODS CSS contains a module-specific selector.');
assert(!/<style\b/i.test(html), 'Inline style blocks are forbidden.');
assert(!/\sstyle\s*=/i.test(html), 'Inline style attributes are forbidden.');
assert(!/\son(?:click|change|submit|input|load|error)\s*=/i.test(html), 'Inline event handlers are forbidden.');

for (const mapping of [
  "'/omnidata-v14-role-system.css': ['omnidata-v14-role-system.css', 'text/css; charset=utf-8', VISUAL_CACHE]",
  "'/ui/omnidata-v14-role-system.js': ['modules/omnidata-v14-role-system.js', JS, VISUAL_CACHE]",
  "'/final-quality.css': ['final-quality.css', 'text/css; charset=utf-8', VISUAL_CACHE]",
  "'/ui/final-quality-core.js': ['modules/final-quality-core.js', JS, VISUAL_CACHE]",
  "'/ui/final-quality.js': ['modules/final-quality.js', JS, VISUAL_CACHE]"
]) assert(staticHandler.includes(mapping), `Missing no-store static mapping: ${mapping}`);

console.log(`Omnidata Design System v1 contract OK (${ROLES.length} roles, ${PARTS.length} semantic parts, ${styledParts.size} styled parts, ${TOKENS.length} tokens).`);

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
