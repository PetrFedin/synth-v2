import test from 'node:test';
import assert from 'node:assert/strict';
import { createRetailDoorService } from '../src/application/retail-door-service.mjs';
import { createMemoryWholesaleStore } from '../src/infrastructure/memory-store.mjs';
import { createBuyerCommercialSnapshot, createRetailDoor, deactivateRetailDoor, reactivateRetailDoor, updateRetailDoor } from '../src/modules/retail-doors/public.mjs';

const address = Object.freeze({ countryCode: 'RU', postalCode: '125009', city: 'Moscow', region: 'Moscow', line1: 'Tverskaya 1', line2: null });
const createdAt = '2026-08-13T12:00:00.000Z';

function door() {
  return createRetailDoor({ id: 'door_1', shopId: 'shop_1', code: ' msk-01 ', name: 'Moscow Flagship', shipToAddress: address, createdAt });
}

async function serviceFixture() {
  const store = createMemoryWholesaleStore();
  await store.transaction((tx) => {
    tx.insertOrganisation(Object.freeze({ id: 'shop_1', type: 'shop', name: 'Buyer LLC' }));
    tx.insertMembership(Object.freeze({ id: 'membership_buyer', organisationId: 'shop_1', organisationType: 'shop', userId: 'buyer_1', role: 'buyer', status: 'active' }));
    tx.insertMembership(Object.freeze({ id: 'membership_viewer', organisationId: 'shop_1', organisationType: 'shop', userId: 'viewer_1', role: 'viewer', status: 'active' }));
  });
  let sequence = 0;
  const service = createRetailDoorService({
    store,
    clock: () => '2026-08-17T12:00:00.000Z',
    nextId: (prefix) => `${prefix}_${++sequence}`,
  });
  const created = await service.createRetailDoor('cmd_create', 'buyer_1', {
    shopId: 'shop_1',
    code: 'MSK-01',
    name: 'Moscow Flagship',
    shipToAddress: address,
  });
  return { store, service, created };
}

test('retail door is versioned and defaults bill-to to ship-to', () => {
  const value = door();
  assert.equal(value.code, 'MSK-01');
  assert.equal(value.version, 1);
  assert.deepEqual(value.billToAddress, value.shipToAddress);
  const updated = updateRetailDoor(value, { name: 'Moscow Tverskaya' }, '2026-08-13T13:00:00.000Z', 1);
  assert.equal(updated.version, 2);
  assert.equal(updated.name, 'Moscow Tverskaya');
  assert.equal(value.name, 'Moscow Flagship');
});

test('buyer commercial snapshot freezes organisation, door version and addresses', () => {
  const current = door();
  const snapshot = createBuyerCommercialSnapshot({ buyer: { id: 'shop_1', type: 'shop', name: 'Buyer LLC' }, door: current });
  const changed = updateRetailDoor(current, { shipToAddress: { ...address, line1: 'Petrovka 2' } }, '2026-08-13T14:00:00.000Z', 1);
  assert.equal(snapshot.retailDoorVersion, 1);
  assert.equal(snapshot.shipToAddress.line1, 'Tverskaya 1');
  assert.equal(changed.shipToAddress.line1, 'Petrovka 2');
});

test('inactive or cross-shop door cannot create buyer snapshot', () => {
  const inactive = deactivateRetailDoor(door(), '2026-08-13T15:00:00.000Z', 1);
  assert.throws(() => createBuyerCommercialSnapshot({ buyer: { id: 'shop_1', type: 'shop', name: 'Buyer LLC' }, door: inactive }), /active/);
  assert.throws(() => createBuyerCommercialSnapshot({ buyer: { id: 'shop_2', type: 'shop', name: 'Other Buyer' }, door: door() }), /belong/);
});

test('deactivated door can be reactivated with optimistic concurrency and used by a new buyer snapshot', () => {
  const buyer = { id: 'shop_1', type: 'shop', name: 'Buyer LLC' };
  const inactive = deactivateRetailDoor(door(), '2026-08-13T15:00:00.000Z', 1);
  assert.equal(inactive.status, 'inactive');
  assert.equal(inactive.version, 2);
  assert.throws(() => createBuyerCommercialSnapshot({ buyer, door: inactive }), /active/);
  assert.throws(() => reactivateRetailDoor(inactive, '2026-08-13T16:00:00.000Z', 1), /changed by another operation/);

  const active = reactivateRetailDoor(inactive, '2026-08-13T16:00:00.000Z', 2);
  assert.equal(active.status, 'active');
  assert.equal(active.version, 3);
  assert.equal(active.code, inactive.code);

  const snapshot = createBuyerCommercialSnapshot({ buyer, door: active });
  assert.equal(snapshot.retailDoorId, active.id);
  assert.equal(snapshot.retailDoorVersion, 3);
  assert.equal(snapshot.doorCode, 'MSK-01');
  assert.strictEqual(reactivateRetailDoor(active, '2026-08-13T17:00:00.000Z', 3), active);
});

test('reactivation service persists one version transition and one outbox event and is command-idempotent', async () => {
  const { store, service, created } = await serviceFixture();
  const inactive = await service.deactivateRetailDoor('cmd_deactivate', 'buyer_1', created.id, { expectedVersion: 1 });
  assert.equal(inactive.status, 'inactive');
  assert.equal(inactive.version, 2);

  const active = await service.reactivateRetailDoor('cmd_reactivate', 'buyer_1', created.id, { expectedVersion: 2 });
  assert.equal(active.status, 'active');
  assert.equal(active.version, 3);

  const afterFirst = store.snapshot();
  assert.equal(afterFirst.retailDoors.find((item) => item.id === created.id)?.version, 3);
  assert.deepEqual(afterFirst.events.map((event) => event.type), [
    'retail-door.created',
    'retail-door.deactivated',
    'retail-door.reactivated',
  ]);
  assert.equal(afterFirst.commands.length, 3);

  const replay = await service.reactivateRetailDoor('cmd_reactivate', 'buyer_1', created.id, { expectedVersion: 2 });
  assert.deepEqual(replay, active);
  const afterReplay = store.snapshot();
  assert.equal(afterReplay.retailDoors.find((item) => item.id === created.id)?.version, 3);
  assert.equal(afterReplay.events.length, 3);
  assert.equal(afterReplay.commands.length, 3);
});

test('reactivation service rolls back stale version without command or outbox side effects', async () => {
  const { store, service, created } = await serviceFixture();
  await service.deactivateRetailDoor('cmd_deactivate', 'buyer_1', created.id, { expectedVersion: 1 });
  await service.reactivateRetailDoor('cmd_reactivate', 'buyer_1', created.id, { expectedVersion: 2 });
  const before = store.snapshot();

  await assert.rejects(
    service.reactivateRetailDoor('cmd_stale', 'buyer_1', created.id, { expectedVersion: 2 }),
    /changed by another operation/,
  );

  const after = store.snapshot();
  assert.equal(after.retailDoors.find((item) => item.id === created.id)?.version, 3);
  assert.equal(after.commands.length, before.commands.length);
  assert.equal(after.events.length, before.events.length);
});

test('reactivation service requires retail door manage capability before state mutation', async () => {
  const { store, service, created } = await serviceFixture();
  await service.deactivateRetailDoor('cmd_deactivate', 'buyer_1', created.id, { expectedVersion: 1 });
  const before = store.snapshot();

  await assert.rejects(
    service.reactivateRetailDoor('cmd_viewer', 'viewer_1', created.id, { expectedVersion: 2 }),
    /grant required capability/,
  );

  const after = store.snapshot();
  assert.equal(after.retailDoors.find((item) => item.id === created.id)?.status, 'inactive');
  assert.equal(after.retailDoors.find((item) => item.id === created.id)?.version, 2);
  assert.equal(after.commands.length, before.commands.length);
  assert.equal(after.events.length, before.events.length);
});
