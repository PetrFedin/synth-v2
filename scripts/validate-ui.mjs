import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');
const modulesDir = path.join(publicDir, 'modules');
const indexPath = path.join(publicDir, 'index.html');
const index = await readFile(indexPath);
assertAscii(index, indexPath);
const html = index.toString('ascii');

assertDocumentContract(html);

const stylesheets = [...html.matchAll(/<link\s+[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g)].map((match) => match[1]);
assertUnique(stylesheets, 'stylesheet');
for (const stylesheet of stylesheets) {
  assertPublicAssetPath(stylesheet, 'stylesheet');
  await assertFileExists(path.join(publicDir, stylesheet.slice(1)), stylesheet);
}

const scriptTags = [...html.matchAll(/<script\s+([^>]*)src="([^"]+)"([^>]*)><\/script>/g)];
const sources = scriptTags.map((match) => match[2]);
if (sources.length < 10 || sources.at(-1) !== '/ui/app-start.js' || sources.includes('/app.js')) {
  fail('Standalone UI script order is invalid.');
}
assertUnique(sources, 'script');
assertRequiredOrder(sources, [
  '/ui/i18n-runtime.js',
  '/ui/api.js',
  '/ui/workspace-pagination.js',
  '/ui/ui-capabilities.js',
  '/ui/ui-validation.js',
  '/ui/app-core.js',
  '/ui/open-form.js',
  '/ui/app-start.js',
]);

for (const [, before, source, after] of scriptTags) {
  if (!/\bdefer\b/.test(`${before} ${after}`)) fail(`UI script must use defer: ${source}`);
  if (!source.startsWith('/ui/')) fail(`Unexpected script path: ${source}`);
  const file = path.join(modulesDir, path.basename(source));
  const bytes = await readFile(file);
  assertAscii(bytes, file);
  new vm.Script(bytes.toString('ascii'), { filename: file });
}

console.log(`Standalone UI contract OK (${sources.length} scripts, ${stylesheets.length} stylesheets checked).`);

function assertDocumentContract(document) {
  if (!/^<!doctype html>/i.test(document.trimStart())) fail('Missing HTML doctype.');
  if (!/<html\s+lang="(?:ru|en)"/.test(document)) fail('Document language is missing or unsupported.');
  if (!/<meta\s+name="viewport"\s+content="[^"]*width=device-width/.test(document)) {
    fail('Responsive viewport metadata is missing.');
  }
  const appRoots = [...document.matchAll(/\bid="app"/g)];
  if (appRoots.length !== 1) fail(`Expected exactly one #app root, found ${appRoots.length}.`);
  if (/<(?:script|style)[^>]*\son[a-z]+\s*=/i.test(document) || /\son(?:click|change|submit|input|load|error)\s*=/i.test(document)) {
    fail('Inline event handlers are not allowed in the standalone UI.');
  }

  const ids = [...document.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assertUnique(ids, 'HTML id');
}

function assertRequiredOrder(actual, required) {
  let previous = -1;
  for (const source of required) {
    const index = actual.indexOf(source);
    if (index === -1) fail(`Required UI script is missing: ${source}`);
    if (index <= previous) fail(`UI dependency order is invalid near: ${source}`);
    previous = index;
  }
}

function assertUnique(values, label) {
  const duplicates = values.filter((value, index) => values.indexOf(value) !== index);
  if (duplicates.length) fail(`Duplicate ${label} entries: ${[...new Set(duplicates)].join(', ')}`);
}

function assertPublicAssetPath(asset, label) {
  if (!asset.startsWith('/') || asset.includes('..') || asset.includes('\\')) {
    fail(`Invalid ${label} path: ${asset}`);
  }
}

async function assertFileExists(file, publicPath) {
  try {
    await access(file);
  } catch {
    fail(`Referenced public asset does not exist: ${publicPath}`);
  }
}

function assertAscii(buffer, file) {
  if ([...buffer].some((byte) => byte > 127)) {
    fail(`Non-ASCII source detected: ${path.relative(root, file)}`);
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
