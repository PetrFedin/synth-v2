import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../public/modules/retail-door-ui-core.js', import.meta.url), 'utf8');

function retailDoorUi() {
  const context = vm.createContext({ window: {} });
  new vm.Script(source, { filename: 'retail-door-ui-core.js' }).runInContext(context);
  return context.window.SynthaRetailDoorUi;
}

const selection = Object.freeze({ id: 'selection_1', shopId: 'shop_1' });
const activeDoor = Object.freeze({ id: 'door_active', shopId: 'shop_1', status: 'active', name: 'Active door' });
const inactiveDoor = Object.freeze({ id: 'door_inactive', shopId: 'shop_1', status: 'inactive', name: 'Inactive door' });
const crossShopDoor = Object.freeze({ id: 'door_cross', shopId: 'shop_2', status: 'active', name: 'Cross shop door' });
const doorsByShop = Object.freeze({ shop_1: Object.freeze([activeDoor, inactiveDoor, crossShopDoor]) });

test('order context exposes only active retail doors belonging to the selected shop', () => {
  const core = retailDoorUi();
  assert.deepEqual(Array.from(core.activeDoorsForSelection(selection, doorsByShop), door => door.id), ['door_active']);
});

test('order payload pins the selected active retail door', () => {
  const core = retailDoorUi();
  const payload = core.buildOrderPayload({
    selectionId: selection.id,
    retailDoorId: activeDoor.id,
    terms: { incoterm: 'DAP' },
  }, [selection], doorsByShop);

  assert.equal(payload.selectionId, selection.id);
  assert.equal(payload.retailDoorId, activeDoor.id);
  assert.equal(payload.terms.incoterm, 'DAP');
  assert.equal(Object.isFrozen(payload), true);
});

test('order payload rejects inactive and cross-shop retail doors', () => {
  const core = retailDoorUi();
  assert.throws(() => core.buildOrderPayload({ selectionId: selection.id, retailDoorId: inactiveDoor.id, terms: {} }, [selection], doorsByShop), /ORDER_RETAIL_DOOR_INVALID/);
  assert.throws(() => core.buildOrderPayload({ selectionId: selection.id, retailDoorId: crossShopDoor.id, terms: {} }, [selection], doorsByShop), /ORDER_RETAIL_DOOR_INVALID/);
});
