import test from 'node:test';
import assert from 'node:assert/strict';
import { createCampaign, changeCampaignStatus } from '../src/modules/campaigns/public.mjs';
import { createCollection, publishCollection } from '../src/modules/collections/public.mjs';

const now = '2026-07-30T20:00:00.000Z';

test('collection can be published only inside an open campaign', () => {
  const draft = createCampaign({
    id: 'campaign-1', brandId: 'brand-1', name: 'Main', season: 'FW27',
    startsAt: '2027-01-01T00:00:00.000Z', endsAt: '2027-02-01T00:00:00.000Z', createdAt: now,
  });
  const collection = createCollection({ id: 'collection-1', campaign: draft, brandId: 'brand-1', name: 'Runway', currency: 'EUR', createdAt: now });
  assert.throws(() => publishCollection(collection, draft, now), (error) => error.code === 'CAMPAIGN_NOT_OPEN');
  const open = changeCampaignStatus(draft, 'open', now);
  assert.equal(publishCollection(collection, open, now).status, 'published');
});
