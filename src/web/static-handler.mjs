import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { invariant } from '../core/errors.mjs';

const DEFAULT_PUBLIC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'public');
const JS = 'text/javascript; charset=utf-8';
const CACHE = 'public, max-age=300';
const ASSETS = Object.freeze({
  '/': ['index.html', 'text/html; charset=utf-8', 'no-store'],
  '/index.html': ['index.html', 'text/html; charset=utf-8', 'no-store'],
  '/styles.css': ['styles.css', 'text/css; charset=utf-8', CACHE],
  '/ui/app-core.js': ['modules/app-core.js', JS, CACHE],
  '/ui/overview.js': ['modules/overview.js', JS, CACHE],
  '/ui/partners.js': ['modules/partners.js', JS, CACHE],
  '/ui/catalog.js': ['modules/catalog.js', JS, CACHE],
  '/ui/showrooms.js': ['modules/showrooms.js', JS, CACHE],
  '/ui/views-2.js': ['modules/views-2.js', JS, CACHE],
  '/ui/views-3.js': ['modules/views-3.js', JS, CACHE],
  '/ui/views-4.js': ['modules/views-4.js', JS, CACHE],
  '/ui/relationship-form.js': ['modules/relationship-form.js', JS, CACHE],
  '/ui/campaign-form.js': ['modules/campaign-form.js', JS, CACHE],
  '/ui/collection-form.js': ['modules/collection-form.js', JS, CACHE],
  '/ui/catalog-form.js': ['modules/catalog-form.js', JS, CACHE],
  '/ui/showroom-form.js': ['modules/showroom-form.js', JS, CACHE],
  '/ui/forms-3.js': ['modules/forms-3.js', JS, CACHE],
  '/ui/open-form.js': ['modules/open-form.js', JS, CACHE],
  '/ui/api.js': ['modules/api.js', JS, CACHE],
  '/ui/dom-1.js': ['modules/dom-1.js', JS, CACHE],
  '/ui/dom-2.js': ['modules/dom-2.js', JS, CACHE],
  '/ui/app-start.js': ['modules/app-start.js', JS, CACHE],
});

export function createStandaloneHandler({ apiHandler, publicDir = DEFAULT_PUBLIC_DIR } = {}) {
  invariant(typeof apiHandler === 'function', 'HTTP_API_HANDLER_REQUIRED', 'API handler is required');
  return async function standaloneHandler(request, response) {
    const url = new URL(request.url ?? '/', 'http://syntha.local');
    const asset = ASSETS[url.pathname];
    if (!asset || !['GET', 'HEAD'].includes(request.method ?? 'GET')) return apiHandler(request, response);
    try {
      const [filename, contentType, cacheControl] = asset;
      const body = await readFile(path.join(publicDir, filename));
      response.statusCode = 200;
      response.setHeader('content-type', contentType);
      response.setHeader('content-length', body.length);
      response.setHeader('cache-control', cacheControl);
      response.setHeader('x-content-type-options', 'nosniff');
      response.setHeader('referrer-policy', 'no-referrer');
      response.setHeader('content-security-policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
      if (request.method === 'HEAD') response.end();
      else response.end(body);
    } catch {
      response.statusCode = 500;
      response.setHeader('content-type', 'application/json; charset=utf-8');
      response.end(JSON.stringify({ error: { code: 'STATIC_ASSET_UNAVAILABLE', message: 'Web workspace asset is unavailable' } }));
    }
  };
}
