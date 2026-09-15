import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const port = Number(process.env.PORT || 4100);
const host = process.env.HOST || '0.0.0.0';

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
    if (!info || !info.isFile()) {
      target = path.join(root, 'index.html');
    }
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

server.listen(port, host, () => console.log(`SYNTHA V2 public demo listening on http://${host}:${port}`));
