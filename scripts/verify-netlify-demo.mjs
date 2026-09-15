import { JSDOM, VirtualConsole } from 'jsdom';

const url = process.env.SYNTHA_VERIFY_URL || 'https://synth-v2-app.netlify.app/';
const errors = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', error => errors.push(`jsdom: ${error.message}`));
virtualConsole.on('error', (...args) => errors.push(`console.error: ${args.map(String).join(' ')}`));

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

console.log(`VERIFY_ROOT ${url}`);
const html = await fetchText(url);
if (!html.includes('Syntha V2') && !html.includes('SYNTHA V2')) throw new Error('root HTML does not contain Syntha title');

console.log('VERIFY_ASSETS');
const appJsUrl = new URL('/app.js?v=20260916-1', url).href;
const appCssUrl = new URL('/app.css?v=20260916-1', url).href;
const [appJs, appCss] = await Promise.all([fetchText(appJsUrl), fetchText(appCssUrl)]);
if (appJs.length < 10000) throw new Error('app.js unexpectedly small');
if (appCss.length < 5000) throw new Error('app.css unexpectedly small');
if (!appJs.includes('SYNTHA_PREVIEW_WORKSPACE')) throw new Error('app.js missing preview workspace');
if (!appJs.includes('SynthaStrictLocaleAudit')) throw new Error('app.js missing app startup');

console.log(`ASSET_SIZES js=${appJs.length} css=${appCss.length}`);

const dom = new JSDOM(html, {
  url,
  runScripts: 'outside-only',
  pretendToBeVisual: true,
  virtualConsole,
});
const { window } = dom;

if (!window.crypto?.randomUUID) {
  Object.defineProperty(window, 'crypto', {
    configurable: true,
    value: { randomUUID: () => '00000000-0000-4000-8000-000000000000' },
  });
}
if (!window.queueMicrotask) window.queueMicrotask = fn => Promise.resolve().then(fn);
if (!window.fetch) window.fetch = globalThis.fetch.bind(globalThis);
if (!window.AbortController) window.AbortController = globalThis.AbortController;
if (!window.structuredClone && globalThis.structuredClone) window.structuredClone = globalThis.structuredClone;

console.log('EXECUTE_APP_JS');
try {
  window.eval(appJs);
} catch (error) {
  throw new Error(`app.js evaluation failed: ${error?.stack || error}`);
}

await new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error(`UI render timeout; errors=${errors.join(' | ')}`)), 10000);
  const poll = () => {
    const shell = window.document.querySelector('.shell');
    const navItems = window.document.querySelectorAll('.nav-item');
    if (shell && navItems.length >= 5) {
      clearTimeout(timeout);
      resolve();
      return;
    }
    setTimeout(poll, 100);
  };
  poll();
});

const text = window.document.body.textContent || '';
if (!text.includes('SYNTHA')) throw new Error('Rendered page missing SYNTHA');
if (!text.includes('Fashion Operating System')) throw new Error('Rendered page missing product title');
if (!window.document.querySelector('.workspace-content')) throw new Error('Workspace content not rendered');

const navItems = [...window.document.querySelectorAll('.nav-item')];
console.log(`NAV_ITEMS ${navItems.length}`);
for (const button of navItems.slice(0, Math.min(navItems.length, 8))) {
  button.click();
  await new Promise(resolve => setTimeout(resolve, 20));
  const content = window.document.querySelector('.workspace-content');
  if (!content || !(content.textContent || '').trim()) {
    throw new Error(`Navigation failed for ${button.textContent?.trim() || 'unknown item'}`);
  }
}

const seriousErrors = errors.filter(message => !message.includes('Could not parse CSS stylesheet'));
if (seriousErrors.length) throw new Error(`Browser errors: ${seriousErrors.join(' | ')}`);

console.log(`NETLIFY_BROWSER_VERIFIED ${url}`);
console.log(`BODY_TEXT_LENGTH ${text.length}`);
window.close();
