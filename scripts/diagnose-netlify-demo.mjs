import { JSDOM, VirtualConsole } from 'jsdom';
import vm from 'node:vm';

const baseUrl = process.env.SYNTHA_VERIFY_URL || 'https://synth-v2-app.netlify.app/';
const sourceUrl = new URL('/demo-static.html', baseUrl).href;

async function fetchText(target, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(target, { redirect: 'follow', signal: controller.signal });
    if (!response.ok) throw new Error(`${target} returned ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

const sourceHtml = await fetchText(sourceUrl);
const scriptRefs = [...sourceHtml.matchAll(/<script[^>]+src="([^"?#]+)[^"]*"[^>]*><\/script>/g)].map(match => match[1]);
console.log(`SCRIPT_COUNT ${scriptRefs.length}`);

const errors = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', error => errors.push(`jsdom: ${error.message}`));
virtualConsole.on('error', (...args) => errors.push(`console.error: ${args.map(String).join(' ')}`));

const dom = new JSDOM('<!doctype html><html lang="ru"><head></head><body><div id="app"></div></body></html>', {
  url: baseUrl,
  runScripts: 'outside-only',
  pretendToBeVisual: true,
  virtualConsole,
});
const { window } = dom;
if (!window.crypto?.randomUUID) Object.defineProperty(window, 'crypto', { configurable: true, value: { randomUUID: () => '00000000-0000-4000-8000-000000000000' } });
if (!window.queueMicrotask) window.queueMicrotask = fn => Promise.resolve().then(fn);
if (!window.fetch) window.fetch = globalThis.fetch.bind(globalThis);
if (!window.AbortController) window.AbortController = globalThis.AbortController;
if (!window.structuredClone && globalThis.structuredClone) window.structuredClone = globalThis.structuredClone;
const context = dom.getInternalVMContext();

for (const ref of scriptRefs) {
  const url = new URL(ref, sourceUrl).href;
  const code = await fetchText(url);
  const started = Date.now();
  console.log(`EVAL_START ${ref} bytes=${code.length}`);
  const script = new vm.Script(code, { filename: ref });
  script.runInContext(context, { timeout: 5000 });
  console.log(`EVAL_OK ${ref} ms=${Date.now() - started}`);
}

await new Promise(resolve => setTimeout(resolve, 1000));
const shell = window.document.querySelector('.shell');
const navItems = window.document.querySelectorAll('.nav-item');
console.log(`RENDER_RESULT shell=${Boolean(shell)} nav=${navItems.length} text=${(window.document.body.textContent || '').length}`);
if (!shell || navItems.length < 5) throw new Error(`UI did not render; errors=${errors.join(' | ')}`);
console.log('DIAGNOSTIC_BROWSER_VERIFIED');
window.close();
