import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkspaceQueryService } from '../src/application/workspace-query-service.mjs';
import { createPostgresWorkspaceReader } from '../src/infrastructure/postgres-workspace-reader.mjs';
import { createWholesaleRoutes, matchWholesaleRoute } from '../src/http/routes.mjs';

function emptyWorkspace(overrides = {}) {
  return {
    memberships: [],
    organisations: [],
    relationships: [],
    invitations: [],
    campaigns: [],
    collections: [],
    catalogSkus: [],
    showrooms: [],
    cycles: [],
    selections: [],
    orders: [],
    deals: [],
    calendar: [],
    ...overrides,
  };
}

test('workspace service validates limits before invoking the reader', async () => {
  let reads = 0;
  const service = createWorkspaceQueryService({
    reader: {
      async readForActor() { reads += 1; return emptyWorkspace(); },
    },
  });

  for (const limit of ['0', '501', '1.5', '+1', ' 10 ', -1, 501]) {
    await assert.rejects(
      () => service.loadForActor('actor-1', { limit }),
      (error) => error.code === 'WORKSPACE_LIMIT_INVALID'
        && error.details.min === 1
        && error.details.max === 500,
    );
  }
  assert.equal(reads, 0);
});

test('reader fetches limit plus one and reports truncated sections without returning the sentinel row', async () => {
  const queries = [];
  const membershipRows = [
    { payload: { id: 'membership-1', userId: 'actor-1', organisationId: 'brand-1', organisationType: 'brand' } },
    { payload: { id: 'membership-2', userId: 'actor-1', organisationId: 'shop-1', organisationType: 'shop' } },
    { payload: { id: 'membership-3', userId: 'actor-1', organisationId: 'shop-2', organisationType: 'shop' } },
  ];
  const client = {
    async query(sql, params = []) {
      queries.push({ sql, params });
      if (sql.startsWith('BEGIN') || sql === 'COMMIT') return { rows: [] };
      if (sql.includes('SELECT organisation_id')) {
        return {
          rows: [
            { organisation_id: 'brand-1', organisation_type: 'brand' },
            { organisation_id: 'shop-1', organisation_type: 'shop' },
            { organisation_id: 'shop-2', organisation_type: 'shop' },
          ],
        };
      }
      if (sql.includes('SELECT brand_id, shop_id')) return { rows: [] };
      if (sql.includes('SELECT campaign_id, collection_id')) return { rows: [] };
      if (sql.includes('SELECT showroom_id FROM showroom_invitations')) return { rows: [] };
      if (sql.includes('SELECT showroom_id FROM selections')) return { rows: [] };
      if (sql.includes('SELECT id, collection_id FROM showrooms')) return { rows: [] };
      if (sql.includes('SELECT payload FROM memberships')) return { rows: membershipRows };
      return { rows: [] };
    },
    release() {},
  };
  const reader = createPostgresWorkspaceReader({ pool: { async connect() { return client; } } });
  const workspace = await createWorkspaceQueryService({ reader }).loadForActor('actor-1', { limit: 2 });

  assert.deepEqual(workspace.memberships.map((membership) => membership.id), ['membership-1', 'membership-2']);
  assert.deepEqual(workspace.pageInfo, {
    limit: 2,
    hasMore: true,
    truncatedSections: ['memberships'],
    nextCursors: {
      memberships: 'WzEsIm1lbWJlcnNoaXBzIixbInNob3AtMSIsImFjdG9yLTEiLCJtZW1iZXJzaGlwLTIiXV0',
    },
  });
  const membershipQuery = queries.find((query) => query.sql.includes('SELECT payload FROM memberships'));
  assert.equal(membershipQuery.params.at(-1), 3);
  assert.match(membershipQuery.sql, /NULLS LAST/);
});

test('reader rejects unsafe direct limits before checking out a connection', async () => {
  let connects = 0;
  const reader = createPostgresWorkspaceReader({
    pool: { async connect() { connects += 1; } },
  });
  for (const limit of [undefined, 0, 501, 1.5, '20']) {
    await assert.rejects(
      () => reader.readForActor('actor-1', { limit }),
      (error) => error.code === 'WORKSPACE_LIMIT_INVALID',
    );
  }
  assert.equal(connects, 0);
});

test('workspace HTTP route forwards only the declared limit query', async () => {
  const calls = [];
  const services = {
    platform: {},
    catalog: {},
    partners: {},
    collaboration: {},
    orders: {},
    notifications: {},
    workspace: {
      async loadForActor(actorId, options) { calls.push({ actorId, options }); return emptyWorkspace(); },
    },
  };
  const route = matchWholesaleRoute(createWholesaleRoutes(services), 'GET', '/v2/workspace');
  await route.execute({ actorId: 'actor-1', query: { limit: '25' }, params: [], body: {} });
  assert.deepEqual(calls, [{ actorId: 'actor-1', options: { limit: '25' } }]);
  await assert.rejects(
    () => route.execute({ actorId: 'actor-1', query: { offset: '10' }, params: [], body: {} }),
    (error) => error.code === 'HTTP_QUERY_FIELD_UNKNOWN',
  );
});
