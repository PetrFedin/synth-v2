import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createStandaloneHandler } from '../src/web/static-handler.mjs';

const TOKEN = 'syntha-v2-ui-preview-token';
const organisationId = 'org-syntha-preview';
const userId = 'user-syntha-preview';
const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

const workspace = Object.freeze({
  memberships: Object.freeze([
    Object.freeze({
      id: 'membership-syntha-preview',
      userId,
      organisationId,
      role: 'owner',
      status: 'active',
    }),
  ]),
  organisations: Object.freeze([
    Object.freeze({
      id: organisationId,
      name: 'SYNTHA Preview',
      type: 'brand',
      status: 'active',
    }),
  ]),
  relationships: Object.freeze([]),
  invitations: Object.freeze([]),
  campaigns: Object.freeze([]),
  collections: Object.freeze([]),
  productStyles: Object.freeze([]),
  catalogSkus: Object.freeze([]),
  showrooms: Object.freeze([]),
  cycles: Object.freeze([]),
  selections: Object.freeze([]),
  orders: Object.freeze([]),
  deals: Object.freeze([]),
  calendar: Object.freeze([]),
  pageInfo: Object.freeze({
    hasMore: false,
    truncatedSections: Object.freeze([]),
    nextCursors: Object.freeze({}),
  }),
});

function commonHeaders(response, contentType) {
  response.setHeader('content-type', contentType);
  response.setHeader('cache-control', 'no-store');
  response.setHeader('x-content-type-options', 'nosniff');
  response.setHeader('x-frame-options', 'DENY');
  response.setHeader('referrer-policy', 'no-referrer');
  response.setHeader('cross-origin-opener-policy', 'same-origin');
  response.setHeader('cross-origin-resource-policy', 'same-origin');
  response.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  response.setHeader('content-security-policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
}

function sendBody(response, statusCode, body, contentType) {
  response.statusCode = statusCode;
  commonHeaders(response, contentType);
  response.setHeader('content-length', Buffer.byteLength(body));
  response.end(body);
}

function sendJson(response, statusCode, data) {
  sendBody(response, statusCode, JSON.stringify(data), 'application/json; charset=utf-8');
}

function authorized(request) {
  return request.headers.authorization === `Bearer ${TOKEN}`;
}

async function previewIndex(response) {
  const source = await readFile(path.join(publicDir, 'index.html'), 'utf8');
  const marker = '<script defer src="/ui/app-start.js?v=visual-20260805-14-components-4"></script>';
  const injected = source.replace(marker, `<script defer src="/ui/preview-session.js"></script>\n  ${marker}`);
  sendBody(response, 200, injected, 'text/html; charset=utf-8');
}

function previewSession(response) {
  const script = `sessionStorage.setItem('syntha-v2-session', ${JSON.stringify(TOKEN)});`;
  sendBody(response, 200, script, 'text/javascript; charset=utf-8');
}

async function previewApi(request, response) {
  const url = new URL(request.url ?? '/', 'http://syntha.preview');

  if (url.pathname === '/health' || url.pathname === '/ready') {
    return sendJson(response, 200, { data: { status: 'ok', mode: 'ui-preview' } });
  }

  if (url.pathname === '/v2/auth/login' && request.method === 'POST') {
    return sendJson(response, 200, { data: { accessToken: TOKEN } });
  }

  if (url.pathname === '/v2/auth/logout' && request.method === 'POST') {
    return sendJson(response, 200, { data: { ok: true } });
  }

  if (!authorized(request)) {
    return sendJson(response, 401, {
      error: { code: 'AUTH_REQUIRED', message: 'Preview session is not authenticated' },
    });
  }

  if (url.pathname === '/v2/auth/me' && request.method === 'GET') {
    return sendJson(response, 200, {
      data: {
        id: userId,
        email: 'owner@syntha.local',
        displayName: 'Syntha Preview',
      },
    });
  }

  if (url.pathname === '/v2/workspace' && request.method === 'GET') {
    return sendJson(response, 200, { data: workspace });
  }

  if (url.pathname === '/v2/notifications/page' && request.method === 'GET') {
    return sendJson(response, 200, {
      data: { items: [], nextCursor: null, unreadCount: 0 },
    });
  }

  if (url.pathname.startsWith('/v2/workspace/') && url.pathname.endsWith('/page') && request.method === 'GET') {
    return sendJson(response, 200, { data: { items: [], nextCursor: null } });
  }

  if (url.pathname.startsWith('/v2/') && !['GET', 'HEAD'].includes(request.method ?? 'GET')) {
    return sendJson(response, 409, {
      error: {
        code: 'UI_PREVIEW_READ_ONLY',
        message: 'This public link is a read-only UI preview of the current Syntha V2 interface.',
      },
    });
  }

  return sendJson(response, 404, {
    error: { code: 'PREVIEW_ROUTE_NOT_AVAILABLE', message: 'This route is not available in UI preview mode.' },
  });
}

const staticHandler = createStandaloneHandler({ apiHandler: previewApi });
const port = Number(process.env.PORT || 4100);
const host = process.env.HOST?.trim() || '0.0.0.0';

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://syntha.preview');
  const task = request.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')
    ? previewIndex(response)
    : request.method === 'GET' && url.pathname === '/ui/preview-session.js'
      ? previewSession(response)
      : staticHandler(request, response);

  Promise.resolve(task).catch((error) => {
    console.error('Syntha V2 UI preview request failed', error);
    if (!response.headersSent) {
      sendJson(response, 500, {
        error: { code: 'UI_PREVIEW_FAILED', message: 'UI preview request failed.' },
      });
    } else {
      response.end();
    }
  });
});

server.listen(port, host, () => {
  console.log(`Syntha V2 UI preview listening on http://${host}:${port}`);
});
