import { JSDOM, VirtualConsole } from 'jsdom';

const url = process.env.SYNTHA_VERIFY_URL || 'https://synth-v2-app.netlify.app/';
const errors = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', error => errors.push(`jsdom: ${error.message}`));
virtualConsole.on('error', (...args) => errors.push(`console.error: ${args.map(String).join(' ')}`));

const root = await fetch(url, { redirect: 'follow' });
if (!root.ok) throw new Error(`root returned ${root.status}`);
const html = await root.text();
if (!html.includes('Syntha V2') && !html.includes('Syntha - Fashion Operating System')) {
  throw new Error('root HTML does not contain Syntha title');
}

for (const asset of ['styles.css','modules/api.js','modules/app-core.js','modules/app-start.js']) {
  const response = await fetch(new URL(asset, url), { redirect: 'follow' });
  if (!response.ok) throw new Error(`${asset} returned ${response.status}`);
  const text = await response.text();
  if (text.length < 100) throw new Error(`${asset} unexpectedly small`);
}

const dom = await JSDOM.fromURL(url, {
  resources: 'usable',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  virtualConsole,
  beforeParse(window) {
    if (!window.crypto?.randomUUID) {
      Object.defineProperty(window, 'crypto', {
        configurable: true,
        value: { randomUUID: () => '00000000-0000-4000-8000-000000000000' },
      });
    }
    if (!window.queueMicrotask) window.queueMicrotask = fn => Promise.resolve().then(fn);
  },
});

const { window } = dom;
await new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error('UI render timeout')), 15000);
  const poll = () => {
    const shell = window.document.querySelector('.shell');
    const navItems = window.document.querySelectorAll('.nav-item');
    if (shell && navItems.length >= 5) {
      clearTimeout(timeout);
      resolve();
      return;
    }
    setTimeout(poll, 200);
  };
  poll();
});

const text = window.document.body.textContent || '';
if (!text.includes('SYNTHA')) throw new Error('Rendered page missing SYNTHA');
if (!text.includes('Fashion Operating System')) throw new Error('Rendered page missing product title');
if (!window.document.querySelector('.workspace-content')) throw new Error('Workspace content not rendered');

const navItems = [...window.document.querySelectorAll('.nav-item')];
for (const button of navItems.slice(0, Math.min(navItems.length, 8))) {
  button.click();
  await new Promise(resolve => setTimeout(resolve, 20));
  if (!window.document.querySelector('.workspace-content')) {
    throw new Error(`Navigation failed for ${button.textContent?.trim() || 'unknown item'}`);
  }
}

const seriousErrors = errors.filter(message => !message.includes('Could not parse CSS stylesheet'));
if (seriousErrors.length) throw new Error(`Browser errors: ${seriousErrors.join(' | ')}`);

console.log(`NETLIFY_BROWSER_VERIFIED ${url}`);
console.log(`NAV_ITEMS ${navItems.length}`);
console.log(`BODY_TEXT_LENGTH ${text.length}`);
window.close();
