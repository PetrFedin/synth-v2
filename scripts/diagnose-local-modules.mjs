import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(repoRoot, 'public');

let jsdomModule;
try {
  jsdomModule = await import('jsdom');
} catch {
  console.log('LOCAL_DIAGNOSTIC_INSTALLING_DEPS');
  const result = spawnSync('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: { ...process.env, NODE_OPTIONS: '' },
  });
  if (result.status !== 0) process.exit(result.status || 40);
  jsdomModule = await import('jsdom');
}
const { JSDOM, VirtualConsole } = jsdomModule;

const html = await readFile(path.join(publicDir, 'index.html'), 'utf8');
const refs = [...html.matchAll(/<script[^>]+src="([^"?#]+)[^"]*"[^>]*><\/script>/g)].map(match => match[1]);
console.log(`LOCAL_DIAGNOSTIC_SCRIPT_COUNT ${refs.length}`);

const errors = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', error => errors.push(`jsdom: ${error.message}`));
virtualConsole.on('error', (...args) => errors.push(`console.error: ${args.map(String).join(' ')}`));
const dom = new JSDOM('<!doctype html><html lang="ru"><head></head><body><div id="app"></div></body></html>', {
  url: 'https://synth-v2-app.netlify.app/',
  runScripts: 'outside-only',
  pretendToBeVisual: true,
  virtualConsole,
});
const { window } = dom;
window.fetch = globalThis.fetch.bind(globalThis);
window.structuredClone = globalThis.structuredClone || ((value) => JSON.parse(JSON.stringify(value)));
window.AbortController = globalThis.AbortController;
if (!window.queueMicrotask) window.queueMicrotask = fn => Promise.resolve().then(fn);
if (!window.crypto?.randomUUID && globalThis.crypto?.randomUUID) window.crypto.randomUUID = globalThis.crypto.randomUUID.bind(globalThis.crypto);
const context = dom.getInternalVMContext();

for (const ref of refs) {
  const target = path.join(publicDir, ref.replace(/^\//, ''));
  const code = await readFile(target, 'utf8');
  const started = Date.now();
  console.log(`LOCAL_EVAL_START ${ref} bytes=${code.length}`);
  try {
    const script = new vm.Script(code, { filename: ref });
    script.runInContext(context, { timeout: 3000 });
  } catch (error) {
    console.error(`LOCAL_EVAL_FAILED ${ref}`, error?.stack || error);
    process.exit(42);
  }
  console.log(`LOCAL_EVAL_OK ${ref} ms=${Date.now() - started}`);
}

await new Promise(resolve => setTimeout(resolve, 500));
const shell = window.document.querySelector('.shell');
const navItems = window.document.querySelectorAll('.nav-item');
console.log(`LOCAL_RENDER_RESULT shell=${Boolean(shell)} nav=${navItems.length} text=${(window.document.body.textContent || '').length}`);
if (errors.length) console.log(`LOCAL_BROWSER_ERRORS ${errors.join(' | ')}`);
if (!shell || navItems.length < 5) process.exit(43);
console.log('LOCAL_DIAGNOSTIC_VERIFIED');
dom.window.close();
process.exit(0);
