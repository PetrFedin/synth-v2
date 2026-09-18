import test from 'node:test';
import assert from 'node:assert/strict';
import { createOutboxPublisherService } from '../src/application/outbox-publisher-service.mjs';
import { createPostgresOutboxPublicationStore } from '../src/infrastructure/postgres-outbox-publication-store.mjs';

// outbox_events carries more than one envelope shape. Publication identity must come from the
// outbox row, otherwise an event whose JSON lacks `id`/`type` cannot be acknowledged, rescheduled
// or dead-lettered — and because processInAggregateOrder does not guard each record, throwing on
// one record fails the whole batch and nothing behind it is ever delivered.
function foreignEnvelopeRecord() {
  return Object.freeze({
    eventId: 'mdm-entry:size-scale:int-alpha:v1',
    eventType: 'MdmEntryChanged',
    event: Object.freeze({
      eventId: 'mdm-entry:size-scale:int-alpha:v1',
      eventType: 'MdmEntryChanged',
      occurredAt: '2026-08-31T00:00:00.000Z',
    }),
    status: 'pending',
    publishedAt: null,
    workerId: 'worker-1',
    claimToken: 'claim-1',
    attemptCount: 1,
  });
}

function domainRecord() {
  return Object.freeze({
    eventId: 'event-1',
    eventType: 'order.created',
    event: Object.freeze({ id: 'event-1', type: 'order.created', aggregateId: 'order-1', occurredAt: '2026-08-31T00:00:01.000Z', payload: {} }),
    status: 'pending',
    publishedAt: null,
    workerId: 'worker-1',
    claimToken: 'claim-1',
    attemptCount: 1,
  });
}

function serviceFor(records, { publish = async () => undefined } = {}) {
  const acknowledged = [];
  const store = {
    claimPending: async () => records,
    acknowledgePublished: async (ownership) => { acknowledged.push(ownership); return true; },
    reschedule: async () => true,
    deadLetter: async () => true,
    listDeadLetters: async () => [],
  };
  const service = createOutboxPublisherService({
    store,
    publisher: { publish },
    workerId: 'worker-1',
    nextClaimToken: () => 'claim-1',
    clock: () => '2026-08-31T00:00:02.000Z',
  });
  return { service, acknowledged };
}

test('an event whose envelope lacks id and type is identified by the outbox row', async () => {
  const delivered = [];
  const { service, acknowledged } = serviceFor([foreignEnvelopeRecord()], {
    publish: async (event) => { delivered.push(event); },
  });

  const [result] = await service.publishPending({ limit: 10 });

  assert.equal(result.status, 'published');
  assert.equal(result.eventId, 'mdm-entry:size-scale:int-alpha:v1');
  assert.equal(result.eventType, 'MdmEntryChanged');
  assert.equal(acknowledged[0].eventId, 'mdm-entry:size-scale:int-alpha:v1');
  assert.equal(delivered.length, 1);
});

// The HTTP publisher enforces its own wire contract: the delivered payload must carry `id` and
// `type`. A foreign envelope is therefore a delivery failure, and the point of keying on the outbox
// row is that the failure is bounded and attributable — rescheduled, then dead-lettered under the
// correct id — instead of throwing before the try/catch and failing the entire batch.
test('a rejected envelope fails and reschedules under its outbox row id', async () => {
  const rescheduled = [];
  const store = {
    claimPending: async () => [foreignEnvelopeRecord()],
    acknowledgePublished: async () => true,
    reschedule: async (ownership) => { rescheduled.push(ownership); return true; },
    deadLetter: async () => true,
    listDeadLetters: async () => [],
  };
  const service = createOutboxPublisherService({
    store,
    publisher: { publish: async () => { const error = new Error('wire contract'); error.code = 'OUTBOX_EVENT_INVALID'; throw error; } },
    workerId: 'worker-1',
    nextClaimToken: () => 'claim-1',
    clock: () => '2026-08-31T00:00:02.000Z',
  });

  const [result] = await service.publishPending({ limit: 10 });

  assert.equal(result.status, 'failed');
  assert.equal(result.eventId, 'mdm-entry:size-scale:int-alpha:v1');
  assert.equal(rescheduled[0].eventId, 'mdm-entry:size-scale:int-alpha:v1');
});

test('one foreign envelope does not fail the whole publication batch', async () => {
  const { service } = serviceFor([foreignEnvelopeRecord(), domainRecord()]);

  const results = await service.publishPending({ limit: 10 });

  assert.equal(results.length, 2);
  assert.deepEqual(results.map((item) => item.status), ['published', 'published']);
  assert.deepEqual(results.map((item) => item.eventId), ['mdm-entry:size-scale:int-alpha:v1', 'event-1']);
});

test('a record with no usable identity is still rejected', async () => {
  const { service } = serviceFor([Object.freeze({
    event: Object.freeze({ occurredAt: '2026-08-31T00:00:00.000Z' }),
    workerId: 'worker-1', claimToken: 'claim-1', attemptCount: 1,
  })]);

  await assert.rejects(() => service.publishPending({ limit: 10 }), (error) => error.code === 'OUTBOX_EVENT_INVALID');
});

test('the publication claim query selects the outbox row key and relational event type', async () => {
  const captured = [];
  const pool = {
    async connect() {
      return {
        async query(sql) { captured.push(String(sql)); return { rows: [], rowCount: 0 }; },
        release() {},
      };
    },
    async query(sql) { captured.push(String(sql)); return { rows: [], rowCount: 0 }; },
  };
  const store = createPostgresOutboxPublicationStore({ pool });
  await store.claimPending({
    workerId: 'worker-1', claimToken: 'claim-1',
    claimedAt: '2026-08-31T00:00:00.000Z', leaseExpiresAt: '2026-08-31T00:05:00.000Z', limit: 5,
  });

  const claimSql = captured.find((sql) => /JOIN outbox_events AS source/.test(sql));
  assert.ok(claimSql, 'claim query must join outbox_events');
  assert.match(claimSql, /SELECT source\.id,\s*source\.event_type,\s*source\.event/);
});
