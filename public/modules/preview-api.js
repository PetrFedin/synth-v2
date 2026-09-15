(function installSynthaStaticPreview(global) {
  'use strict';

  const TOKEN_KEY = 'syntha-v2-session';
  const TOKEN = 'syntha-v2-static-preview-token';
  const originalFetch = global.fetch.bind(global);

  const organisationId = 'org-syntha-preview';
  const userId = 'user-syntha-preview';
  const workspace = Object.freeze({
    memberships: Object.freeze([
      Object.freeze({ id: 'membership-syntha-preview', userId, organisationId, role: 'owner', status: 'active' }),
    ]),
    organisations: Object.freeze([
      Object.freeze({ id: organisationId, name: 'SYNTHA Preview', type: 'brand', status: 'active' }),
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
    pageInfo: Object.freeze({ hasMore: false, truncatedSections: Object.freeze([]), nextCursors: Object.freeze({}) }),
  });

  sessionStorage.setItem(TOKEN_KEY, TOKEN);

  function json(data, status = 200) {
    return Promise.resolve(new Response(JSON.stringify(data), {
      status,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    }));
  }

  function pathOf(input) {
    if (typeof input === 'string') return new URL(input, global.location.href).pathname;
    if (input instanceof Request) return new URL(input.url, global.location.href).pathname;
    return '';
  }

  global.fetch = function previewFetch(input, init = {}) {
    const path = pathOf(input);
    const method = String(init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    if (!path.startsWith('/v2/') && path !== '/health' && path !== '/ready') return originalFetch(input, init);

    if (path === '/health' || path === '/ready') return json({ data: { status: 'ok', mode: 'static-preview' } });
    if (path === '/v2/auth/login' && method === 'POST') return json({ data: { accessToken: TOKEN } });
    if (path === '/v2/auth/logout' && method === 'POST') return json({ data: { ok: true } });
    if (path === '/v2/auth/me' && method === 'GET') {
      return json({ data: { id: userId, email: 'owner@syntha.local', displayName: 'Syntha Preview' } });
    }
    if (path === '/v2/workspace' && method === 'GET') return json({ data: workspace });
    if (path === '/v2/notifications/page' && method === 'GET') {
      return json({ data: { items: [], nextCursor: null, unreadCount: 0 } });
    }
    if (path.startsWith('/v2/workspace/') && path.endsWith('/page') && method === 'GET') {
      return json({ data: { items: [], nextCursor: null } });
    }
    if (!['GET', 'HEAD'].includes(method)) {
      return json({ error: { code: 'UI_PREVIEW_READ_ONLY', message: 'Public preview is read-only.' } }, 409);
    }
    return json({ error: { code: 'PREVIEW_ROUTE_NOT_AVAILABLE', message: 'This preview route is not available.' } }, 404);
  };
})(window);
