import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';
import { TextDecoder } from 'node:util';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');
const modulesDir = path.join(publicDir, 'modules');
const indexPath = path.join(publicDir, 'index.html');
const html = decodeUtf8(await readFile(indexPath), indexPath);

assertDocumentContract(html);

const stylesheetUrls = [...html.matchAll(/<link\s+[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g)].map((match) => match[1]);
const stylesheets = stylesheetUrls.map(assetPathname);
assertUnique(stylesheets, 'stylesheet');
for (let index = 0; index < stylesheetUrls.length; index += 1) {
  assertPublicAssetPath(stylesheetUrls[index], 'stylesheet');
  await assertFileExists(path.join(publicDir, stylesheets[index].slice(1)), stylesheetUrls[index]);
}

const scriptTags = [...html.matchAll(/<script\s+([^>]*)src="([^"]+)"([^>]*)><\/script>/g)];
const sourceUrls = scriptTags.map((match) => match[2]);
const sources = sourceUrls.map(assetPathname);
if (sources.length < 10 || sources.at(-1) !== '/ui/app-start.js' || sources.includes('/app.js')) fail('Standalone UI script order is invalid.');
assertUnique(sources, 'script');
assertRequiredOrder(sources, [
  '/ui/i18n-runtime.js','/ui/i18n-v7.js','/ui/api.js','/ui/workspace-pagination.js','/ui/notification-pagination.js','/ui/ui-capabilities.js','/ui/ui-validation.js','/ui/app-core.js','/ui/open-form.js',
  '/ui/planning-core.js','/ui/styles-core.js','/ui/materials-core.js','/ui/bom-core.js','/ui/measurement-core.js','/ui/sample-core.js','/ui/sourcing-core.js','/ui/tech-pack-core.js','/ui/production-execution-core.js','/ui/final-quality-core.js',
  '/ui/omnidata-workspace.js','/ui/omnidata-polish.js','/ui/omnidata-fidelity.js','/ui/omnidata-v5.js','/ui/planning.js','/ui/styles.js','/ui/materials.js','/ui/bom.js','/ui/omnidata-v7.js','/ui/linesheet-matrix-core.js','/ui/linesheets.js','/ui/omnidata-v7-installed.js',
  '/ui/measurements.js','/ui/measurement-revision-actions.js','/ui/measurement-catalog-sync.js','/ui/samples.js','/ui/sample-catalog-sync.js','/ui/sourcing.js','/ui/tech-pack-navigation.js','/ui/tech-packs.js','/ui/production-orders.js','/ui/production-executions.js','/ui/final-quality.js',
  '/ui/omnidata-v7-language-audit.js','/ui/omnidata-v8.js','/ui/omnidata-v9.js','/ui/omnidata-v10.js','/ui/omnidata-v11.js','/ui/omnidata-v12.js','/ui/omnidata-v13.js','/ui/omnidata-v14.js','/ui/omnidata-v14-module-adapters.js','/ui/omnidata-v14-components.js','/ui/omnidata-v14-role-system.js','/ui/dom-boolean-props.js','/ui/app-start.js'
]);

for (const [, before, sourceUrl, after] of scriptTags) {
  if (!/\bdefer\b/.test(`${before} ${after}`)) fail(`UI script must use defer: ${sourceUrl}`);
  const source = assetPathname(sourceUrl);
  assertPublicAssetPath(sourceUrl, 'script');
  if (!source.startsWith('/ui/')) fail(`Unexpected script path: ${sourceUrl}`);
  const file = path.join(modulesDir, path.basename(source));
  new vm.Script(decodeUtf8(await readFile(file), file), { filename: file });
}

for (const retired of ['/ui/omnidata-v4.js', '/ui/omnidata-v6.js']) if (sources.includes(retired)) fail(`Retired visual layer must not be loaded: ${retired}`);

assertRequiredOrder(stylesheets, ['/omnidata-v12.css','/omnidata-v13.css','/omnidata-v14.css','/omnidata-v14-module-adapters.css','/omnidata-v14-extensions.css','/omnidata-v14-role-system.css']);
if (stylesheets.at(-1) !== '/omnidata-v14-role-system.css') fail('Omnidata Design System v1 must be loaded as the final visual contract.');
for (const required of ['/ui/omnidata-v14.js','/ui/omnidata-v14-module-adapters.js','/ui/omnidata-v14-components.js','/ui/omnidata-v14-role-system.js']) if (!sources.includes(required)) fail(`Required Omnidata runtime is missing: ${required}`);
if (!/<meta\s+name="syntha-build"\s+content="visual-20260805-14">/.test(html)) fail('Omnidata V14 build metadata is missing.');
if (!/<meta\s+name="syntha-design-system"\s+content="omnidata-design-system-v1">/.test(html)) fail('Omnidata Design System v1 metadata is missing.');
if (!/<meta\s+name="syntha-design-system-version"\s+content="1\.0\.0">/.test(html)) fail('Omnidata Design System version metadata is missing.');
if (!stylesheets.includes('/sourcing.css')) fail('Industrial sourcing stylesheet is missing.');
for (const retiredStyle of ['/samples.css','/tech-packs.css','/production-executions.css','/production-orders.css','/final-quality.css']) if (stylesheets.includes(retiredStyle)) fail(`${retiredStyle} must remain ODS-native and must not load a local stylesheet.`);

console.log(`Standalone UI contract OK (${sources.length} scripts, ${stylesheets.length} stylesheets checked; Samples, Tech Packs, Production Executions, Production Orders and Final Quality are ODS-native).`);

function assertDocumentContract(document) {
  if (!/^<!doctype html>/i.test(document.trimStart())) fail('Missing HTML doctype.');
  if (!/<html\s+lang="(?:ru|en)"/.test(document)) fail('Document language is missing or unsupported.');
  if (!/<meta\s+name="viewport"\s+content="[^"]*width=device-width/.test(document)) fail('Responsive viewport metadata is missing.');
  if ([...document.matchAll(/\bid="app"/g)].length !== 1) fail('Expected exactly one #app root.');
  if (/\son(?:click|change|submit|input|load|error)\s*=/i.test(document)) fail('Inline event handlers are not allowed.');
  assertUnique([...document.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]), 'HTML id');
}
function assertRequiredOrder(actual, required) { let previous=-1; for (const source of required) { const index=actual.indexOf(source); if(index===-1) fail(`Required UI asset is missing: ${source}`); if(index<=previous) fail(`UI dependency order is invalid near: ${source}`); previous=index; } }
function assertUnique(values,label){const duplicates=values.filter((value,index)=>values.indexOf(value)!==index);if(duplicates.length)fail(`Duplicate ${label} entries: ${[...new Set(duplicates)].join(', ')}`)}
function assetPathname(asset){try{return new URL(asset,'http://syntha.local').pathname}catch{fail(`Invalid public asset URL: ${asset}`)}}
function assertPublicAssetPath(asset,label){const pathname=assetPathname(asset);if(!asset.startsWith('/')||!pathname.startsWith('/')||pathname.includes('..')||pathname.includes('\\'))fail(`Invalid ${label} path: ${asset}`)}
async function assertFileExists(file,publicPath){try{await access(file)}catch{fail(`Referenced public asset does not exist: ${publicPath}`)}}
function decodeUtf8(buffer,file){let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(buffer)}catch{fail(`Invalid UTF-8 source detected: ${path.relative(root,file)}`)}if(text.includes('\uFFFD'))fail(`Replacement character detected: ${path.relative(root,file)}`);if(/(?:\u00d0|\u00d1)[\u0080-\u00ff]/u.test(text))fail(`Mojibake detected: ${path.relative(root,file)}`);return text}
function fail(message){console.error(message);process.exit(1)}
