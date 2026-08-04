import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { invariant } from '../core/errors.mjs';

const DEFAULT_PUBLIC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'public');
const JS = 'text/javascript; charset=utf-8';
const CACHE = 'public, max-age=300';
const VISUAL_CACHE = 'no-store';
const ASSETS = Object.freeze({
  '/': ['index.html', 'text/html; charset=utf-8', 'no-store'],
  '/index.html': ['index.html', 'text/html; charset=utf-8', 'no-store'],
  '/styles.css': ['styles.css', 'text/css; charset=utf-8', CACHE],
  '/i18n.css': ['i18n.css', 'text/css; charset=utf-8', CACHE],
  '/omnidata.css': ['omnidata.css', 'text/css; charset=utf-8', VISUAL_CACHE],
  '/omnidata-fidelity.css': ['omnidata-fidelity.css', 'text/css; charset=utf-8', VISUAL_CACHE],
  '/omnidata-v3.css': ['omnidata-v3.css', 'text/css; charset=utf-8', VISUAL_CACHE],
  '/omnidata-v4.css': ['omnidata-v4.css', 'text/css; charset=utf-8', VISUAL_CACHE],
  '/omnidata-v5.css': ['omnidata-v5.css', 'text/css; charset=utf-8', VISUAL_CACHE],
  '/omnidata-v5-workspace.css': ['omnidata-v5-workspace.css', 'text/css; charset=utf-8', VISUAL_CACHE],
  '/omnidata-v5-responsive.css': ['omnidata-v5-responsive.css', 'text/css; charset=utf-8', VISUAL_CACHE],
  '/omnidata-v6.css': ['omnidata-v6.css', 'text/css; charset=utf-8', VISUAL_CACHE],
  '/omnidata-v7.css': ['omnidata-v7.css', 'text/css; charset=utf-8', VISUAL_CACHE],
  '/omnidata-v7-bom.css': ['omnidata-v7-bom.css', 'text/css; charset=utf-8', VISUAL_CACHE],
  '/omnidata-v8.css': ['omnidata-v8.css', 'text/css; charset=utf-8', VISUAL_CACHE],
  '/omnidata-v8-reference.css': ['omnidata-v8-reference.css', 'text/css; charset=utf-8', VISUAL_CACHE],
  '/industrial-product.css': ['industrial-product.css', 'text/css; charset=utf-8', VISUAL_CACHE],
  '/bom.css': ['bom.css', 'text/css; charset=utf-8', VISUAL_CACHE],
  '/measurements.css': ['measurements.css', 'text/css; charset=utf-8', VISUAL_CACHE],
  '/measurement-sync.css': ['measurement-sync.css', 'text/css; charset=utf-8', VISUAL_CACHE],
  '/ui/i18n-runtime.js': ['modules/i18n-runtime.js', JS, CACHE],
  '/ui/i18n-v7.js': ['modules/i18n-v7.js', JS, VISUAL_CACHE],
  '/ui/ui-capabilities.js': ['modules/ui-capabilities.js', JS, CACHE],
  '/ui/ui-validation.js': ['modules/ui-validation.js', JS, CACHE],
  '/ui/workspace-pagination.js': ['modules/workspace-pagination.js', JS, CACHE],
  '/ui/notification-pagination.js': ['modules/notification-pagination.js', JS, CACHE],
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
  '/ui/workflow-contexts.js': ['modules/workflow-contexts.js', JS, CACHE],
  '/ui/forms-3.js': ['modules/forms-3.js', JS, CACHE],
  '/ui/open-form.js': ['modules/open-form.js', JS, CACHE],
  '/ui/api.js': ['modules/api.js', JS, CACHE],
  '/ui/dom-1.js': ['modules/dom-1.js', JS, CACHE],
  '/ui/dom-2.js': ['modules/dom-2.js', JS, CACHE],
  '/ui/planning-core.js': ['modules/planning-core.js', JS, VISUAL_CACHE],
  '/ui/styles-core.js': ['modules/styles-core.js', JS, VISUAL_CACHE],
  '/ui/materials-core.js': ['modules/materials-core.js', JS, VISUAL_CACHE],
  '/ui/bom-core.js': ['modules/bom-core.js', JS, VISUAL_CACHE],
  '/ui/measurement-core.js': ['modules/measurement-core.js', JS, VISUAL_CACHE],
  '/ui/omnidata-workspace.js': ['modules/omnidata-workspace.js', JS, VISUAL_CACHE],
  '/ui/order-lifecycle-actions.js': ['modules/order-lifecycle-actions.js', JS, CACHE],
  '/ui/omnidata-polish.js': ['modules/omnidata-polish.js', JS, VISUAL_CACHE],
  '/ui/omnidata-fidelity.js': ['modules/omnidata-fidelity.js', JS, VISUAL_CACHE],
  '/ui/omnidata-v4.js': ['modules/omnidata-v4.js', JS, VISUAL_CACHE],
  '/ui/omnidata-v5.js': ['modules/omnidata-v5.js', JS, VISUAL_CACHE],
  '/ui/omnidata-v6.js': ['modules/omnidata-v6.js', JS, VISUAL_CACHE],
  '/ui/omnidata-v7.js': ['modules/omnidata-v7.js', JS, VISUAL_CACHE],
  '/ui/omnidata-v7-installed.js': ['modules/omnidata-v7-installed.js', JS, VISUAL_CACHE],
  '/ui/omnidata-v7-language-audit.js': ['modules/omnidata-v7-language-audit.js', JS, VISUAL_CACHE],
  '/ui/omnidata-v8.js': ['modules/omnidata-v8.js', JS, VISUAL_CACHE],
  '/ui/planning.js': ['modules/planning.js', JS, VISUAL_CACHE],
  '/ui/styles.js': ['modules/styles.js', JS, VISUAL_CACHE],
  '/ui/materials.js': ['modules/materials.js', JS, VISUAL_CACHE],
  '/ui/bom.js': ['modules/bom.js', JS, VISUAL_CACHE],
  '/ui/measurements.js': ['modules/measurements.js', JS, VISUAL_CACHE],
  '/ui/measurement-revision-actions.js': ['modules/measurement-revision-actions.js', JS, VISUAL_CACHE],
  '/ui/measurement-catalog-sync.js': ['modules/measurement-catalog-sync.js', JS, VISUAL_CACHE],
  '/ui/app-start.js': ['modules/app-start.js', JS, CACHE],
});

export function createStandaloneHandler({ apiHandler, publicDir = DEFAULT_PUBLIC_DIR } = {}) {
  invariant(typeof apiHandler === 'function', 'HTTP_API_HANDLER_REQUIRED', 'API handler is required');
  return async function standaloneHandler(request, response) {
    const url = new URL(request.url ?? '/', 'http://syntha.local');
    const asset = ASSETS[url.pathname];
    if (!asset) return apiHandler(request, response);
    if (!['GET', 'HEAD'].includes(request.method ?? 'GET')) return methodNotAllowed(response);
    try {
      const [filename, contentType, cacheControl] = asset;
      const body = await readFile(path.join(publicDir, filename));
      const etag = strongEtag(body);
      applyStaticHeaders(response, { contentType, cacheControl, etag });
      if (etagMatches(request.headers['if-none-match'], etag)) { response.statusCode = 304; return response.end(); }
      response.statusCode = 200;
      response.setHeader('content-length', body.length);
      if (request.method === 'HEAD') response.end(); else response.end(body);
    } catch {
      applyStaticHeaders(response, { contentType: 'application/json; charset=utf-8', cacheControl: 'no-store' });
      const body = JSON.stringify({ error: { code: 'STATIC_ASSET_UNAVAILABLE', message: 'Web workspace asset is unavailable' } });
      response.statusCode = 500;
      response.setHeader('content-length', Buffer.byteLength(body));
      response.end(body);
    }
  };
}
function methodNotAllowed(response) {
  const body = JSON.stringify({ error: { code: 'HTTP_METHOD_NOT_ALLOWED', message: 'Only GET and HEAD are allowed for static assets' } });
  applyStaticHeaders(response, { contentType: 'application/json; charset=utf-8', cacheControl: 'no-store' });
  response.statusCode = 405;
  response.setHeader('allow', 'GET, HEAD');
  response.setHeader('content-length', Buffer.byteLength(body));
  response.end(body);
}
function strongEtag(body) { return `"${createHash('sha256').update(body).digest('base64url')}"`; }
function etagMatches(value, etag) {
  const header = Array.isArray(value) ? value.join(',') : value;
  if (!header) return false;
  return header.split(',').some((candidate) => { const normalized = candidate.trim(); return normalized === '*' || normalized === etag || normalized === `W/${etag}`; });
}
function applyStaticHeaders(response, { contentType, cacheControl, etag } = {}) {
  if (contentType) response.setHeader('content-type', contentType);
  response.setHeader('cache-control', cacheControl ?? 'no-store');
  if (etag) response.setHeader('etag', etag);
  response.setHeader('x-content-type-options', 'nosniff');
  response.setHeader('x-frame-options', 'DENY');
  response.setHeader('referrer-policy', 'no-referrer');
  response.setHeader('cross-origin-opener-policy', 'same-origin');
  response.setHeader('cross-origin-resource-policy', 'same-origin');
  response.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  response.setHeader('content-security-policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
}
