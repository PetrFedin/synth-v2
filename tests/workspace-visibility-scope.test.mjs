import test from 'node:test';
import assert from 'node:assert/strict';
import { createPostgresWorkspaceReader } from '../src/infrastructure/postgres-workspace-reader.mjs';

test('linked visibility is independent from bounded response collections', async () => {
  const seen = {};
  const client = {
    async query(sql, params = []) {
      if (sql.startsWith('BEGIN') || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
      if (sql.includes('SELECT organisation_id')) {
        return { rows: [{ organisation_id: 'shop-1', organisation_type: 'shop' }] };
      }
      if (sql.includes('SELECT brand_id, shop_id')) {
        return { rows: [{ brand_id: 'brand-1', shop_id: 'shop-1' }] };
      }
      if (sql.includes('SELECT campaign_id, collection_id')) {
        return { rows: [{ campaign_id: 'campaign-linked', collection_id: 'collection-linked' }] };
      }
      if (sql.includes('SELECT showroom_id FROM showroom_invitations')) {
        return { rows: [{ showroom_id: 'showroom-linked' }] };
      }
      if (sql.includes('SELECT showroom_id FROM selections')) return { rows: [] };
      if (sql.includes('SELECT id, collection_id FROM showrooms')) {
        return { rows: [{ id: 'showroom-linked', collection_id: 'collection-showroom' }] };
      }
      if (sql.includes('SELECT payload FROM memberships')) {
        return {
          rows: [{ payload: { id: 'membership-1', userId: 'actor-1', organisationId: 'shop-1', organisationType: 'shop' } }],
        };
      }
      if (sql.includes('SELECT payload FROM commercial_cycles')) return { rows: [] };
      if (sql.includes('SELECT payload FROM campaigns')) { seen.campaigns = params; return { rows: [] }; }
      if (sql.includes('SELECT payload FROM collections')) { seen.collections = params; return { rows: [] }; }
      if (sql.includes('SELECT payload FROM showrooms')) { seen.showrooms = params; return { rows: [] }; }
      if (sql.includes('SELECT payload FROM catalog_skus')) { seen.catalog = params; return { rows: [] }; }
      return { rows: [] };
    },
    release() {},
  };
  const reader = createPostgresWorkspaceReader({ pool: { async connect() { return client; } } });
  const workspace = await reader.readForActor('actor-1', { limit: 1 });

  assert.deepEqual(workspace.cycles, [], 'the bounded response may contain no cycles');
  assert.deepEqual(seen.campaigns[0], ['campaign-linked']);
  assert.deepEqual(seen.collections[0], ['collection-linked']);
  assert.deepEqual(seen.showrooms[0], ['showroom-linked']);
  assert.deepEqual([...seen.catalog[1]].sort(), ['collection-linked', 'collection-showroom']);
});
