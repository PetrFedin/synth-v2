import { domainEvent } from '../core/events.mjs';
import { invariant } from '../core/errors.mjs';
import { canonicalJson, fingerprintsMatch } from '../core/fingerprints.mjs';
import { assertWholesaleStore } from './store-contract.mjs';
import { CAPABILITIES, assertCapability } from '../modules/access-control/public.mjs';
import {
  createRetailDoor as createDoor,
  deactivateRetailDoor as deactivateDoor,
  reactivateRetailDoor as reactivateDoor,
  updateRetailDoor as updateDoor,
} from '../modules/retail-doors/public.mjs';

export function createRetailDoorService({ store, clock = () => new Date().toISOString(), nextId = defaultIdGenerator() } = {}) {
  assertWholesaleStore(store);

  function execute(commandId, fingerprint, actorId, prepare, action) {
    invariant(commandId, 'COMMAND_ID_REQUIRED', 'Every mutation requires commandId');
    return store.transaction(async (tx) => {
      const previous = await tx.getCommand(commandId);
      if (previous) invariant(fingerprintsMatch(previous.fingerprint, fingerprint), 'COMMAND_ID_CONFLICT', 'commandId was already used by another mutation', { commandId });
      const context = await prepare(tx);
      if (previous) return previous.result;
      const result = await action(tx, context);
      await tx.insertCommand(Object.freeze({ id: commandId, fingerprint, actorId, result, completedAt: clock() }));
      return result;
    });
  }

  async function append(tx, type, door, commandId, actorId) {
    await tx.appendOutbox(domainEvent({
      id: nextId('event'),
      type,
      aggregateId: door.id,
      occurredAt: clock(),
      payload: Object.freeze({ shopId: door.shopId, retailDoorId: door.id, code: door.code, status: door.status, version: door.version }),
      metadata: { commandId, actorId },
    }));
  }

  async function shopAccess(tx, shopId, actorId, capability) {
    const shop = await tx.getOrganisation(shopId);
    invariant(shop?.type === 'shop', 'SHOP_REQUIRED', 'Retail door organisation must be a shop', { shopId });
    const membership = await tx.getMembership(shopId, actorId);
    assertCapability(membership, capability);
    return shop;
  }

  async function currentDoor(tx, doorId, forUpdate = false) {
    const door = forUpdate ? await tx.getRetailDoorForUpdate(doorId) : await tx.getRetailDoor(doorId);
    invariant(door, 'RETAIL_DOOR_NOT_FOUND', 'Retail door not found', { doorId });
    return door;
  }

  return Object.freeze({
    createRetailDoor(commandId, actorId, input) {
      const fingerprint = `retailDoor.create:${actorId}:${canonicalJson(input)}`;
      return execute(commandId, fingerprint, actorId,
        async (tx) => Object.freeze({ shop: await shopAccess(tx, input.shopId, actorId, CAPABILITIES.RETAIL_DOOR_MANAGE) }),
        async (tx, { shop }) => {
          const door = createDoor({ ...input, shopId: shop.id, id: nextId('retail-door'), createdAt: clock() });
          const duplicate = await tx.getRetailDoorByShopCode(shop.id, door.code);
          invariant(!duplicate, 'RETAIL_DOOR_CODE_EXISTS', 'Retail door code already exists for shop', { shopId: shop.id, code: door.code });
          await tx.insertRetailDoor(door);
          await append(tx, 'retail-door.created', door, commandId, actorId);
          return door;
        });
    },

    updateRetailDoor(commandId, actorId, doorId, input) {
      const fingerprint = `retailDoor.update:${actorId}:${doorId}:${canonicalJson(input)}`;
      return execute(commandId, fingerprint, actorId,
        async (tx) => {
          const current = await currentDoor(tx, doorId, true);
          await shopAccess(tx, current.shopId, actorId, CAPABILITIES.RETAIL_DOOR_MANAGE);
          return current;
        },
        async (tx, current) => {
          requireExpectedVersion(input.expectedVersion);
          const updated = updateDoor(current, input, clock(), input.expectedVersion);
          await tx.saveRetailDoor(updated, input.expectedVersion);
          await append(tx, 'retail-door.updated', updated, commandId, actorId);
          return updated;
        });
    },

    deactivateRetailDoor(commandId, actorId, doorId, { expectedVersion } = {}) {
      const input = { expectedVersion };
      const fingerprint = `retailDoor.deactivate:${actorId}:${doorId}:${canonicalJson(input)}`;
      return execute(commandId, fingerprint, actorId,
        async (tx) => {
          const current = await currentDoor(tx, doorId, true);
          await shopAccess(tx, current.shopId, actorId, CAPABILITIES.RETAIL_DOOR_MANAGE);
          return current;
        },
        async (tx, current) => {
          requireExpectedVersion(expectedVersion);
          const updated = deactivateDoor(current, clock(), expectedVersion);
          if (updated === current) return current;
          await tx.saveRetailDoor(updated, expectedVersion);
          await append(tx, 'retail-door.deactivated', updated, commandId, actorId);
          return updated;
        });
    },

    reactivateRetailDoor(commandId, actorId, doorId, { expectedVersion } = {}) {
      const input = { expectedVersion };
      const fingerprint = `retailDoor.reactivate:${actorId}:${doorId}:${canonicalJson(input)}`;
      return execute(commandId, fingerprint, actorId,
        async (tx) => {
          const current = await currentDoor(tx, doorId, true);
          await shopAccess(tx, current.shopId, actorId, CAPABILITIES.RETAIL_DOOR_MANAGE);
          return current;
        },
        async (tx, current) => {
          requireExpectedVersion(expectedVersion);
          const updated = reactivateDoor(current, clock(), expectedVersion);
          if (updated === current) return current;
          await tx.saveRetailDoor(updated, expectedVersion);
          await append(tx, 'retail-door.reactivated', updated, commandId, actorId);
          return updated;
        });
    },

    getRetailDoorForActor(actorId, doorId) {
      return store.transaction(async (tx) => {
        const door = await currentDoor(tx, doorId);
        await shopAccess(tx, door.shopId, actorId, CAPABILITIES.RETAIL_DOOR_READ);
        return door;
      });
    },

    listRetailDoorsForActor(actorId, shopId) {
      return store.transaction(async (tx) => {
        await shopAccess(tx, shopId, actorId, CAPABILITIES.RETAIL_DOOR_READ);
        return Object.freeze([...(await tx.listRetailDoorsByShop(shopId))]);
      });
    },
  });
}

function requireExpectedVersion(value) {
  invariant(Number.isSafeInteger(value) && value > 0, 'RETAIL_DOOR_EXPECTED_VERSION_INVALID', 'expectedVersion must be a positive integer');
}

function defaultIdGenerator() {
  let sequence = 0;
  return (prefix) => `${prefix}_${++sequence}`;
}
