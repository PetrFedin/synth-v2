import test from 'node:test';
import assert from 'node:assert/strict';
import { CAPABILITIES, ROLE_CAPABILITIES } from '../src/modules/access-control/public.mjs';
import {
  AWAITING_ACTION_GROUPS,
  AWAITING_ACTION_TYPES,
  AWAITING_ACTION_TYPE_CODES,
  awaitingActionType,
  buildAwaitingActionItem,
  normalizeAwaitingActionQuery,
  rolesForAwaitingAction,
  summariseAwaitingActionCounts,
} from '../src/modules/awaiting-action/public.mjs';
import { createAwaitingActionQueryService } from '../src/application/awaiting-action-query-service.mjs';

const NOW = '2026-10-02T12:00:00.000Z';

test('every kind of waiting work names a real capability, a screen and a family', () => {
  const known = new Set(Object.values(CAPABILITIES));
  assert.equal(new Set(AWAITING_ACTION_TYPE_CODES).size, AWAITING_ACTION_TYPES.length, 'type codes are unique');
  for (const entry of AWAITING_ACTION_TYPES) {
    assert.ok(known.has(entry.capability), `${entry.type} names an unknown capability`);
    assert.ok(entry.view && entry.group && entry.labelRu && entry.labelEn, `${entry.type} is incomplete`);
    assert.ok(rolesForAwaitingAction(entry.type).length > 0, `${entry.type} would be shown to nobody`);
  }
});

test('a role sees a kind of work only if it holds the capability of the command that does it', () => {
  // The inspection decision is the quality role's, not sales': sales read quality but cannot sign it.
  assert.deepEqual([...rolesForAwaitingAction('inspection-review')].sort(), ['admin', 'owner', 'quality']);
  assert.deepEqual([...rolesForAwaitingAction('supplier-payment')].sort(), ['admin', 'finance', 'owner']);
  assert.ok(rolesForAwaitingAction('order-accept-terms').includes('buyer'));
  assert.ok(!rolesForAwaitingAction('order-accept-terms').includes('viewer'));
  assert.deepEqual([...rolesForAwaitingAction('selection-approval')].sort(), ['admin', 'finance', 'owner']);
  for (const entry of AWAITING_ACTION_TYPES) {
    for (const role of rolesForAwaitingAction(entry.type)) assert.ok(ROLE_CAPABILITIES[role].includes(entry.capability));
    // A viewer can read everything and do nothing: nothing may be waiting for them.
    assert.ok(!rolesForAwaitingAction(entry.type).includes('viewer'), `${entry.type} is shown to a viewer`);
  }
  assert.throws(() => rolesForAwaitingAction('nonsense'), (error) => error.code === 'AWAITING_ACTION_TYPE_UNKNOWN');
});

test('the query narrows by type or family and bounds the page', () => {
  const all = normalizeAwaitingActionQuery({});
  assert.deepEqual(all.types, AWAITING_ACTION_TYPE_CODES);
  assert.equal(all.limit, 100);
  assert.deepEqual(normalizeAwaitingActionQuery({ type: 'rfq-award, order-attach', limit: '5' }).types, ['order-attach', 'rfq-award']);
  assert.equal(normalizeAwaitingActionQuery({ limit: '0' }).limit, 0);
  const quality = normalizeAwaitingActionQuery({ group: 'quality' }).types;
  assert.deepEqual(quality, AWAITING_ACTION_TYPES.filter((entry) => entry.group === 'quality').map((entry) => entry.type));
  assert.ok(AWAITING_ACTION_GROUPS.includes('quality'));
  // The two filters intersect rather than the later one silently winning.
  assert.deepEqual(normalizeAwaitingActionQuery({ group: 'quality', type: 'rfq-award' }).types, []);
  for (const bad of [{ type: 'nonsense' }, { type: 'rfq-award,nonsense' }, { group: 'nonsense' }, { limit: '-1' }, { limit: '201' }, { limit: '1.5' }, { limit: 'many' }]) {
    assert.throws(() => normalizeAwaitingActionQuery(bad), (error) => /^AWAITING_ACTION_/.test(error.code), JSON.stringify(bad));
  }
});

test('an item carries entity, screen, age and lateness derived from the reference time', () => {
  const item = buildAwaitingActionItem({
    type: 'supplier-payment', entityId: 'PO-1#2', label: 'PO-1 · Аванс', organisationId: 'brand-1',
    since: '2026-09-25T12:00:00.000Z', dueAt: '2026-10-01T12:00:00.000Z', detail: { amountMinor: 1000 },
  }, NOW);
  assert.equal(item.type, 'supplier-payment');
  assert.equal(item.entityKind, 'payment-milestone');
  assert.deepEqual(item.route, { view: 'production-orders', entityId: 'PO-1#2' });
  assert.equal(item.ageSeconds, 7 * 86_400);
  assert.equal(item.overdue, true);
  assert.equal(item.overdueSeconds, 86_400);
  assert.equal(item.dueAt, '2026-10-01T12:00:00.000Z');
  assert.equal(item.detail.amountMinor, 1000);

  const open = buildAwaitingActionItem({ type: 'order-accept-terms', entityId: 'order-1', label: null, organisationId: 'shop-1', since: '2026-10-02T11:00:00.000Z', dueAt: null }, NOW);
  assert.equal(open.overdue, false);
  assert.equal(open.dueAt, null);
  assert.equal('overdueSeconds' in open, false);
  assert.equal(open.ageSeconds, 3600);
  assert.equal(open.label, 'order-1');

  // A due date in the future is a deadline, not lateness.
  assert.equal(buildAwaitingActionItem({ type: 'showroom-invitation-response', entityId: 'i-1', organisationId: 'shop-1', since: NOW, dueAt: '2026-10-09T12:00:00.000Z' }, NOW).overdue, false);
  // A clock that is behind the data never produces a negative age.
  assert.equal(buildAwaitingActionItem({ type: 'order-attach', entityId: 'o', organisationId: 's', since: '2026-10-03T00:00:00.000Z', dueAt: null }, NOW).ageSeconds, 0);
  assert.throws(() => buildAwaitingActionItem({ type: 'nonsense', entityId: 'x', organisationId: 'o' }, NOW), (error) => error.code === 'AWAITING_ACTION_TYPE_UNKNOWN');
});

test('counters add up across kinds and ignore kinds the catalogue does not know', () => {
  const summary = summariseAwaitingActionCounts([
    { type: 'rfq-award', count: 2, overdue: 0 },
    { type: 'supplier-payment', count: 3, overdue: 1 },
    { type: 'nonsense', count: 99, overdue: 9 },
  ]);
  assert.equal(summary.total, 5);
  assert.equal(summary.overdue, 1);
  assert.deepEqual(summary.byType['supplier-payment'], { count: 3, overdue: 1 });
  assert.throws(() => summariseAwaitingActionCounts([{ type: 'rfq-award', count: -1 }]), (error) => error.code === 'AWAITING_ACTION_COUNT_INVALID');
});

function readerReturning(result, calls = []) {
  return { async forActor(actorId, request) { calls.push({ actorId, request }); return result; } };
}

test('the service asks the reader once, with the filter, and answers with counters for every requested kind', async () => {
  const calls = [];
  const service = createAwaitingActionQueryService({
    clock: () => NOW,
    reader: readerReturning({
      rows: [{ type: 'rfq-award', entityId: 'RFQ-1', label: 'RFQ-1 · SKU', organisationId: 'brand-1', since: '2026-10-01T12:00:00.000Z', dueAt: null, detail: { quoteCount: 2 } }],
      counts: [{ type: 'rfq-award', count: 4, overdue: 0 }],
    }, calls),
  });
  const result = await service.forActor('user-1', { type: 'rfq-award,order-attach', limit: '10' });
  assert.equal(calls.length, 1, 'one reader call, whatever the number of kinds');
  assert.deepEqual(calls[0], { actorId: 'user-1', request: { types: ['order-attach', 'rfq-award'], limit: 10, asOf: NOW } });
  assert.equal(result.asOf, NOW);
  assert.equal(result.total, 4, 'the counter covers more than the page');
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].ageSeconds, 86_400);
  const attach = awaitingActionType('order-attach');
  const award = awaitingActionType('rfq-award');
  assert.deepEqual(result.counts, {
    'order-attach': { group: 'orders', titleRu: attach.labelRu, titleEn: attach.labelEn, count: 0, overdue: 0 },
    'rfq-award': { group: 'sourcing', titleRu: award.labelRu, titleEn: award.labelEn, count: 4, overdue: 0 },
  });
});

test('the service refuses what the reader should not have returned, and does not call it for an empty filter', async () => {
  await assert.rejects(
    createAwaitingActionQueryService({ clock: () => NOW, reader: readerReturning({ rows: [{ type: 'supplier-payment', entityId: 'x', organisationId: 'o', since: NOW }], counts: [] }) })
      .forActor('user-1', { type: 'rfq-award' }),
    (error) => error.code === 'AWAITING_ACTION_RESULT_INVALID',
  );
  await assert.rejects(
    createAwaitingActionQueryService({ clock: () => NOW, reader: readerReturning({ rows: 'nope', counts: [] }) }).forActor('user-1', {}),
    (error) => error.code === 'AWAITING_ACTION_RESULT_INVALID',
  );
  const calls = [];
  const empty = await createAwaitingActionQueryService({ clock: () => NOW, reader: readerReturning({ rows: [], counts: [] }, calls) })
    .forActor('user-1', { group: 'quality', type: 'rfq-award' });
  assert.equal(calls.length, 0);
  assert.equal(empty.total, 0);
  assert.deepEqual(empty.items, []);
  await assert.rejects(createAwaitingActionQueryService({ reader: readerReturning({ rows: [], counts: [] }) }).forActor('', {}), (error) => error.code === 'AWAITING_ACTION_ACTOR_REQUIRED');
  assert.throws(() => createAwaitingActionQueryService({}), (error) => error.code === 'AWAITING_ACTION_READER_REQUIRED');
});

test('limit 0 returns the counters without a page', async () => {
  const result = await createAwaitingActionQueryService({
    clock: () => NOW,
    reader: readerReturning({ rows: [], counts: [{ type: 'order-attach', count: 7, overdue: 0 }] }),
  }).forActor('user-1', { limit: '0' });
  assert.equal(result.total, 7);
  assert.deepEqual(result.items, []);
});
