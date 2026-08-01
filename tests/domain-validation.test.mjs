import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIsoDateTime, requiredText } from '../src/core/validation.mjs';
import { createCampaign } from '../src/modules/campaigns/public.mjs';
import { createCollection } from '../src/modules/collections/public.mjs';
import { createShowroom } from '../src/modules/showrooms/public.mjs';
import { createOrganisation } from '../src/modules/organisations/public.mjs';
import { createShowroomInvitation, acceptShowroomInvitation } from '../src/modules/showroom-invitations/public.mjs';

const createdAt = '2026-08-01T12:00:00.000Z';

test('ISO date validation rejects ambiguous and impossible dates', () => {
  assert.equal(parseIsoDateTime('2026-08-01').value, '2026-08-01');
  assert.equal(parseIsoDateTime('2026-08-01T12:30:00.000Z').value, '2026-08-01T12:30:00.000Z');
  assert.throws(() => parseIsoDateTime('08/01/2026'), (error) => error.code === 'DATETIME_INVALID');
  assert.throws(() => parseIsoDateTime('2026-02-30'), (error) => error.code === 'DATETIME_INVALID');
  assert.throws(() => parseIsoDateTime('2026-02-30T12:00:00Z'), (error) => error.code === 'DATETIME_INVALID');
});

test('required text trims values and enforces hard maximums', () => {
  assert.equal(requiredText('  Main  ', { code: 'NAME_INVALID', label: 'Name', max: 10 }), 'Main');
  assert.throws(() => requiredText('x'.repeat(11), { code: 'NAME_INVALID', label: 'Name', max: 10 }), (error) => error.code === 'NAME_INVALID');
});

test('campaign and showroom reject invalid dates and oversized names', () => {
  const campaign = createCampaign({ id: 'campaign-1', brandId: 'brand-1', name: 'FW', season: 'FW27', startsAt: '2027-01-01', endsAt: '2027-02-01', createdAt });
  assert.equal(campaign.name, 'FW');
  assert.throws(() => createCampaign({ id: 'campaign-2', brandId: 'brand-1', name: 'FW', season: 'FW27', startsAt: '2027-02-30', endsAt: '2027-03-01', createdAt }), (error) => error.code === 'CAMPAIGN_DATES_INVALID');
  assert.throws(() => createCampaign({ id: 'campaign-3', brandId: 'brand-1', name: 'x'.repeat(161), season: 'FW27', startsAt: '2027-01-01', endsAt: '2027-02-01', createdAt }), (error) => error.code === 'CAMPAIGN_NAME_REQUIRED');

  const collection = createCollection({ id: 'collection-1', campaign: { ...campaign, status: 'open' }, brandId: 'brand-1', name: 'Main', currency: 'EUR', createdAt });
  assert.throws(() => createShowroom({ id: 'showroom-1', collection: { ...collection, status: 'published' }, brandId: 'brand-1', name: 'Paris', opensAt: '2027-01-20', closesAt: '2027-01-10', createdAt }), (error) => error.code === 'SHOWROOM_DATES_INVALID');
});

test('organisation fields have bounded storage-safe lengths', () => {
  assert.equal(createOrganisation({ id: 'brand-1', type: 'brand', name: ' Brand ' }).name, 'Brand');
  assert.throws(() => createOrganisation({ id: 'x'.repeat(161), type: 'brand', name: 'Brand' }), (error) => error.code === 'ORG_ID_REQUIRED');
  assert.throws(() => createOrganisation({ id: 'brand-1', type: 'brand', name: 'x'.repeat(161) }), (error) => error.code === 'ORG_NAME_REQUIRED');
});

test('showroom invitations validate every temporal boundary', () => {
  const relationship = { id: 'relationship-1', brandId: 'brand-1', shopId: 'shop-1', status: 'active' };
  const showroom = { id: 'showroom-1', collectionId: 'collection-1', brandId: 'brand-1', status: 'open' };
  const invitation = createShowroomInvitation({ id: 'invite-1', showroom, shopId: 'shop-1', relationship, expiresAt: '2026-08-02T12:00:00.000Z', createdAt });
  assert.equal(invitation.status, 'pending');
  assert.throws(() => createShowroomInvitation({ id: 'invite-2', showroom, shopId: 'shop-1', relationship, expiresAt: '2026-02-30', createdAt }), (error) => error.code === 'SHOWROOM_INVITATION_EXPIRY_INVALID');
  assert.throws(() => acceptShowroomInvitation(invitation, 'shop-1', 'not-a-date'), (error) => error.code === 'SHOWROOM_INVITATION_TIMESTAMP_INVALID');
});
