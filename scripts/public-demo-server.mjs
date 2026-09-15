import { createServer } from 'node:http';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const port = Number(process.env.PORT || 4100);
const host = process.env.HOST || '0.0.0.0';
const publicUrl = process.env.SYNTHA_PUBLIC_URL || 'https://synth-v2-live-demo.onrender.com';

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

const server = createServer(async (req, res) => {
  try {
    if (!['GET','HEAD'].includes(req.method || 'GET')) {
      res.writeHead(405, {'content-type':'text/plain; charset=utf-8','allow':'GET, HEAD'});
      return res.end('Method not allowed');
    }
    const url = new URL(req.url || '/', 'http://localhost');
    if (url.pathname === '/health' || url.pathname === '/ready') {
      res.writeHead(200, {'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
      return res.end(JSON.stringify({status:'ok',mode:'public-demo'}));
    }
    const file = safeFile(url.pathname);
    if (!file) {
      res.writeHead(400, {'content-type':'text/plain; charset=utf-8'});
      return res.end('Bad request');
    }
    let target = file;
    const info = await stat(target).catch(() => null);
    if (!info || !info.isFile()) target = path.join(root, 'index.html');
    const body = await readFile(target);
    const type = mime.get(path.extname(target).toLowerCase()) || 'application/octet-stream';
    res.writeHead(200, {
      'content-type': type,
      'content-length': body.length,
      'cache-control': target.endsWith('index.html') ? 'no-store' : 'public, max-age=300',
      'x-content-type-options': 'nosniff'
    });
    if (req.method === 'HEAD') return res.end();
    res.end(body);
  } catch (error) {
    console.error(error);
    res.writeHead(500, {'content-type':'text/plain; charset=utf-8'});
    res.end('SYNTHA V2 failed to serve');
  }
});

async function verifyLocalAssets() {
  const index = await readFile(path.join(root, 'index.html'), 'utf8');
  if (!index.includes('Syntha - Fashion Operating System')) throw new Error('Unexpected index.html');
  const refs = [...index.matchAll(/(?:src|href)="([^"?#]+)[^"]*"/g)].map(match => match[1]);
  for (const ref of refs) {
    const target = path.join(root, ref.replace(/^\//, ''));
    const info = await stat(target).catch(() => null);
    if (!info?.isFile()) throw new Error(`Missing public asset: ${ref}`);
  }
  const moduleDir = path.join(root, 'modules');
  for (const name of await readdir(moduleDir)) {
    if (!name.endsWith('.js')) continue;
    const source = await readFile(path.join(moduleDir, name), 'utf8');
    new vm.Script(source, { filename: name });
  }
}

async function fetchOk(relativePath, mustContain = '') {
  const response = await fetch(new URL(relativePath, publicUrl), { redirect: 'follow' });
  if (!response.ok) throw new Error(`${relativePath} returned ${response.status}`);
  const text = await response.text();
  if (mustContain && !text.includes(mustContain)) throw new Error(`${relativePath} content check failed`);
}

async function verifyPublicUrl() {
  const checks = [
    ['/', 'Syntha - Fashion Operating System'],
    ['/health', 'public-demo'],
    ['/modules/api.js', 'SYNTHA_PREVIEW_WORKSPACE'],
    ['/modules/app-core.js', 'NAV_GROUPS'],
    ['/modules/app-start.js', 'SynthaStrictLocaleAudit'],
    ['/styles.css', ''],
    ['/omnidata-v14.css', ''],
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
