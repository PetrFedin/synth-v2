import test from 'node:test';
import assert from 'node:assert/strict';
import { createCalendarMilestone } from '../src/modules/calendar/public.mjs';

function milestone(overrides = {}) {
  return createCalendarMilestone({
    id: 'calendar-1', ownerOrganisationId: 'brand-1', cycleId: 'cycle-1', type: 'order',
    title: 'Delivery window', startsAt: '2026-10-01T00:00:00.000Z', ...overrides,
  });
}

test('defaults visibility to private and normalizes the timestamp', () => {
  const value = milestone();
  assert.equal(value.visibility, 'private');
  assert.equal(value.startsAt, '2026-10-01T00:00:00.000Z');
  assert.ok(Object.isFrozen(value));
});

test('trims the title', () => {
  assert.equal(milestone({ title: '  Delivery window  ' }).title, 'Delivery window');
});

test('rejects a missing owner or cycle link', () => {
  assert.throws(() => milestone({ ownerOrganisationId: '' }), { code: 'CALENDAR_LINK_REQUIRED' });
  assert.throws(() => milestone({ cycleId: '' }), { code: 'CALENDAR_LINK_REQUIRED' });
});

test('rejects an unsupported type or visibility', () => {
  assert.throws(() => milestone({ type: 'invoice' }), { code: 'CALENDAR_TYPE_INVALID' });
  assert.throws(() => milestone({ visibility: 'public' }), { code: 'CALENDAR_VISIBILITY_INVALID' });
});

test('rejects an empty title and a title over 200 characters', () => {
  assert.throws(() => milestone({ title: '  ' }), { code: 'CALENDAR_TITLE_INVALID' });
  assert.throws(() => milestone({ title: 'x'.repeat(201) }), { code: 'CALENDAR_TITLE_INVALID' });
});

test('rejects a startsAt that is not a valid ISO date-time', () => {
  assert.throws(() => milestone({ startsAt: 'not-a-date' }), { code: 'CALENDAR_STARTS_AT_INVALID' });
  assert.throws(() => milestone({ startsAt: undefined }), { code: 'CALENDAR_STARTS_AT_INVALID' });
});
