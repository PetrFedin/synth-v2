import test from 'node:test';
import assert from 'node:assert/strict';
import { createBuyerCommercialSnapshot, createRetailDoor, deactivateRetailDoor, updateRetailDoor } from '../src/modules/retail-doors/public.mjs';

const address = Object.freeze({ countryCode: 'RU', postalCode: '125009', city: 'Moscow', region: 'Moscow', line1: 'Tverskaya 1', line2: null });
const createdAt = '2026-08-13T12:00:00.000Z';

function door() {
  return createRetailDoor({ id: 'door_1', shopId: 'shop_1', code: ' msk-01 ', name: 'Moscow Flagship', shipToAddress: address, createdAt });
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
