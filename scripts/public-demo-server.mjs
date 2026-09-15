import { createServer } from 'node:http';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const port = Number(process.env.PORT || 4100);
const host = process.env.HOST || '0.0.0.0';
const publicUrl = process.env.SYNTHA_PUBLIC_URL || 'https://synth-v2-app.onrender.com';

const mime = new Map([
  ['.html','text/html; charset=utf-8'],['.css','text/css; charset=utf-8'],['.js','text/javascript; charset=utf-8'],
  ['.json','application/json; charset=utf-8'],['.svg','image/svg+xml'],['.png','image/png'],['.jpg','image/jpeg'],
  ['.jpeg','image/jpeg'],['.webp','image/webp'],['.ico','image/x-icon'],['.woff2','font/woff2'],['.woff','font/woff']
]);

function safeFile(urlPath) {
  const requested = urlPath === '/' ? '/index.html' : urlPath;
  const decoded = decodeURIComponent(requested.split('?')[0]);
  const resolved = path.resolve(root, '.' + decoded);
  if (!resolved.startsWith(root + path.sep) && resolved !== root) return null;
  return resolved;
}

async function buildBrowserBundle() {
  const source = await readFile(path.join(root, 'index.html'), 'utf8');
  if (!source.includes('Syntha - Fashion Operating System')) throw new Error('Unexpected index.html');

  const cssRefs = [...source.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"?#]+)[^"]*"[^>]*>/g)].map(match => match[1]);
  const jsRefs = [...source.matchAll(/<script[^>]+src="([^"?#]+)[^"]*"[^>]*><\/script>/g)].map(match => match[1]);

  const readRef = async (ref) => {
    const target = path.join(root, ref.replace(/^\//, ''));
    const info = await stat(target).catch(() => null);
    if (!info?.isFile()) throw new Error(`Missing public asset: ${ref}`);
    return readFile(target, 'utf8');
  };

  const cssParts = [];
  for (const ref of cssRefs) cssParts.push(`/* ${ref} */\n${await readRef(ref)}`);

  const jsParts = [];
  for (const ref of jsRefs) {
    const code = await readRef(ref);
    new vm.Script(code, { filename: ref });
    jsParts.push(`\n/* ${ref} */\n${code}\n;`);
  }

  const html = `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="color-scheme" content="light">
  <meta name="theme-color" content="#353945">
  <title>Syntha - Fashion Operating System</title>
  <style>
    html,body{margin:0;min-height:100%;background:#f5f6f8;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#222}
    #syntha-boot{min-height:100vh;display:grid;place-items:center;padding:24px;box-sizing:border-box}
    #syntha-boot-card{width:min(520px,100%);background:white;border:1px solid #e4e6eb;border-radius:18px;padding:28px;box-sizing:border-box;box-shadow:0 10px 30px rgba(0,0,0,.06)}
    #syntha-boot-title{font-size:28px;font-weight:700;letter-spacing:.02em;margin:0 0 8px}
    #syntha-boot-copy{margin:0;color:#6b7280;font-size:15px;line-height:1.5}
  </style>
  <link rel="stylesheet" href="/app.css?v=20260916-2">
</head>
<body>
  <div id="app" aria-live="polite">
    <div id="syntha-boot"><div id="syntha-boot-card"><div id="syntha-boot-title">SYNTHA V2</div><p id="syntha-boot-copy">Загрузка Fashion Operating System…</p></div></div>
  </div>
  <noscript>Для запуска SYNTHA V2 требуется JavaScript.</noscript>
  <script defer src="/app.js?v=20260916-2"></script>
</body>
</html>`;

  return Object.freeze({ html, css: cssParts.join('\n\n'), js: jsParts.join('\n') });
}

const bundle = await buildBrowserBundle();

const server = createServer(async (req, res) => {
  try {
    if (!['GET','HEAD'].includes(req.method || 'GET')) {
      res.writeHead(405, {'content-type':'text/plain; charset=utf-8','allow':'GET, HEAD'});
      return res.end('Method not allowed');
    }
    const url = new URL(req.url || '/', 'http://localhost');
    if (url.pathname === '/health' || url.pathname === '/ready') {
      res.writeHead(200, {'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
      return res.end(JSON.stringify({status:'ok',mode:'public-demo',bundle:'single-js-single-css',browserSmoke:'passed'}));
    }
    if (url.pathname === '/' || url.pathname === '/index.html') {
      const body = Buffer.from(bundle.html);
      res.writeHead(200, {'content-type':'text/html; charset=utf-8','content-length':body.length,'cache-control':'no-store','x-content-type-options':'nosniff'});
      return req.method === 'HEAD' ? res.end() : res.end(body);
    }
    if (url.pathname === '/app.css') {
      const body = Buffer.from(bundle.css);
      res.writeHead(200, {'content-type':'text/css; charset=utf-8','content-length':body.length,'cache-control':'public, max-age=300','x-content-type-options':'nosniff'});
      return req.method === 'HEAD' ? res.end() : res.end(body);
    }
    if (url.pathname === '/app.js') {
      const body = Buffer.from(bundle.js);
      res.writeHead(200, {'content-type':'text/javascript; charset=utf-8','content-length':body.length,'cache-control':'public, max-age=300','x-content-type-options':'nosniff'});
      return req.method === 'HEAD' ? res.end() : res.end(body);
    }

    const file = safeFile(url.pathname);
    if (!file) {
      res.writeHead(400, {'content-type':'text/plain; charset=utf-8'});
      return res.end('Bad request');
    }
    const info = await stat(file).catch(() => null);
    if (!info?.isFile()) {
      res.writeHead(404, {'content-type':'text/plain; charset=utf-8'});
      return res.end('Not found');
    }
    const body = await readFile(file);
    const type = mime.get(path.extname(file).toLowerCase()) || 'application/octet-stream';
    res.writeHead(200, {'content-type':type,'content-length':body.length,'cache-control':'public, max-age=300','x-content-type-options':'nosniff'});
    if (req.method === 'HEAD') return res.end();
    res.end(body);
  } catch (error) {
    console.error(error);
    res.writeHead(500, {'content-type':'text/plain; charset=utf-8'});
    res.end('SYNTHA V2 failed to serve');
  }
});

async function verifyBrowserDom() {
  const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', {
    url: publicUrl,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const { window } = dom;
  window.fetch = globalThis.fetch;
  window.structuredClone = globalThis.structuredClone || ((value) => JSON.parse(JSON.stringify(value)));
  if (!window.crypto?.randomUUID && globalThis.crypto?.randomUUID) window.crypto.randomUUID = globalThis.crypto.randomUUID.bind(globalThis.crypto);
  window.eval(bundle.js);
  await new Promise(resolve => setTimeout(resolve, 350));
  const shell = window.document.querySelector('.shell');
  const text = window.document.body.textContent || '';
  if (!shell) throw new Error('Browser smoke test did not render .shell');
  if (!text.includes('SYNTHA')) throw new Error('Browser smoke test did not render SYNTHA UI');
  dom.window.close();
}

async function verifyLocalAssets() {
  const moduleDir = path.join(root, 'modules');
  for (const name of await readdir(moduleDir)) {
    if (!name.endsWith('.js')) continue;
    const source = await readFile(path.join(moduleDir, name), 'utf8');
    new vm.Script(source, { filename: name });
  }
  new vm.Script(bundle.js, { filename: 'app.js' });
  if (!bundle.html.includes('/app.js')) throw new Error('Bundled HTML missing app.js');
  if (!bundle.js.includes('SYNTHA_PREVIEW_WORKSPACE')) throw new Error('Bundled JS missing preview workspace');
  if (!bundle.js.includes('SynthaStrictLocaleAudit')) throw new Error('Bundled JS missing app startup');
  if (bundle.css.length < 1000) throw new Error('Bundled CSS is unexpectedly small');
  await verifyBrowserDom();
  console.log('BROWSER_DOM_SMOKE_VERIFIED');
}

async function fetchOk(relativePath, mustContain = '') {
  const response = await fetch(new URL(relativePath, publicUrl), { redirect: 'follow' });
  if (!response.ok) throw new Error(`${relativePath} returned ${response.status}`);
  const text = await response.text();
  if (mustContain && !text.includes(mustContain)) throw new Error(`${relativePath} content check failed`);
}

async function verifyPublicUrl() {
  const checks = [
    ['/', 'SYNTHA V2'],
    ['/health', 'browserSmoke'],
    ['/app.js', 'SYNTHA_PREVIEW_WORKSPACE'],
    ['/app.js', 'SynthaStrictLocaleAudit'],
    ['/app.css', '.shell'],
  ];
  let lastError;
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    try {
      for (const [target, marker] of checks) await fetchOk(target, marker);
      console.log(`PUBLIC_DEMO_VERIFIED ${publicUrl}`);
      return;
    } catch (error) {
      lastError = error;
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }
  throw lastError || new Error('Public verification failed');
}

await verifyLocalAssets();
server.listen(port, host, async () => {
  console.log(`SYNTHA V2 public demo listening on http://${host}:${port}`);
  try {
    await verifyPublicUrl();
  } catch (error) {
    console.error('PUBLIC_DEMO_VERIFICATION_FAILED', error);
    process.exitCode = 1;
    server.close(() => process.exit(1));
  }
});
