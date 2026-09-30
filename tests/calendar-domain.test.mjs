import test from 'node:test';
import assert from 'node:assert/strict';
import { createCalendarMilestone, createCalendarMilestoneTemplate } from '../src/modules/calendar/public.mjs';

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

function template(overrides = {}) {
  return createCalendarMilestoneTemplate({
    id: 'calendar-template-1', organisationId: 'brand-1', name: 'Стандартный цикл заказа',
    lines: [
      { title: 'Заказ подтверждён', type: 'order', offsetDays: 0 },
      { title: 'Груз готов', type: 'order', offsetDays: 60, visibility: 'shared' },
    ],
    createdAt: '2026-10-01T00:00:00.000Z', createdBy: 'user-1',
    ...overrides,
  });
}

test('a template normalizes each line, defaulting visibility to private and trimming titles', () => {
  const value = template();
  assert.ok(Object.isFrozen(value));
  assert.equal(value.lines.length, 2);
  assert.equal(value.lines[0].visibility, 'private');
  assert.equal(value.lines[1].visibility, 'shared');
  assert.equal(value.lines[1].offsetDays, 60);
});

test('a template trims its own name', () => {
  assert.equal(template({ name: '  Стандартный цикл заказа  ' }).name, 'Стандартный цикл заказа');
});

test('a template rejects a missing organisation link or creator', () => {
  assert.throws(() => template({ organisationId: '' }), { code: 'CALENDAR_TEMPLATE_LINK_REQUIRED' });
  assert.throws(() => template({ createdBy: '' }), { code: 'CALENDAR_TEMPLATE_CREATED_BY_REQUIRED' });
});

test('a template needs between 1 and 50 lines', () => {
  assert.throws(() => template({ lines: [] }), { code: 'CALENDAR_TEMPLATE_LINES_INVALID' });
  assert.throws(() => template({ lines: Array.from({ length: 51 }, (_, index) => ({ title: `Line ${index}`, type: 'order', offsetDays: index })) }), { code: 'CALENDAR_TEMPLATE_LINES_INVALID' });
});

test('a template line rejects an unsupported type, visibility or a non-integer offset', () => {
  assert.throws(() => template({ lines: [{ title: 'X', type: 'invoice', offsetDays: 0 }] }), { code: 'CALENDAR_TYPE_INVALID' });
  assert.throws(() => template({ lines: [{ title: 'X', type: 'order', offsetDays: 0, visibility: 'public' }] }), { code: 'CALENDAR_VISIBILITY_INVALID' });
  assert.throws(() => template({ lines: [{ title: 'X', type: 'order', offsetDays: 1.5 }] }), { code: 'CALENDAR_TEMPLATE_OFFSET_INVALID' });
  assert.throws(() => template({ lines: [{ title: 'X', type: 'order', offsetDays: '5' }] }), { code: 'CALENDAR_TEMPLATE_OFFSET_INVALID' });
});

test('a template line still requires a title within bounds, same as a standalone milestone', () => {
  assert.throws(() => template({ lines: [{ title: '  ', type: 'order', offsetDays: 0 }] }), { code: 'CALENDAR_TITLE_INVALID' });
});

test('a negative offset is allowed, since a line can name something due before the anchor', () => {
  const value = template({ lines: [{ title: 'Book factory slot', type: 'order', offsetDays: -30 }] });
  assert.equal(value.lines[0].offsetDays, -30);
});
