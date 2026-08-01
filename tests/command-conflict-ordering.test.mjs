import test from 'node:test';
import assert from 'node:assert/strict';
import { createCatalogService } from '../src/application/catalog-service.mjs';
import { createNotificationService } from '../src/application/notification-service.mjs';
import { createOrderBuilderService } from '../src/application/order-builder-service.mjs';
import { createPartnerAccessService } from '../src/application/partner-access-service.mjs';
import { createWholesalePlatform } from '../src/application/platform.mjs';
import { createShowroomSelectionService } from '../src/application/showroom-selection-service.mjs';

function conflictingTx(extra = {}) {
  return Object.freeze({
    async getCommand() {
      return Object.freeze({
        id: 'command-1',
        fingerprint: 'another-operation:another-actor',
        actorId: 'another-actor',
        result: Object.freeze({ protected: true }),
      });
    },
    ...extra,
  });
}

function wholesaleStore(tx) {
  return Object.freeze({
    async transaction(work) { return work(tx); },
    async snapshot() { return {}; },
  });
}

async function rejectsConflict(action) {
  await assert.rejects(action, (error) => error.code === 'COMMAND_ID_CONFLICT');
}

test('wholesale command conflict is rejected before protected entity reads', async () => {
  const platform = createWholesalePlatform({
    store: wholesaleStore(conflictingTx({
      getOrganisation() { throw new Error('protected organisation read must not run'); },
    })),
  });
  await rejectsConflict(() => platform.createCampaign('command-1', 'user-1', {
    brandId: 'brand-1',
    name: 'Campaign',
    season: 'SS27',
  }));
});

test('partner command conflict is rejected before relationship reads', async () => {
  const service = createPartnerAccessService({
    store: wholesaleStore(conflictingTx({
      getRelationship() { throw new Error('protected relationship read must not run'); },
    })),
  });
  await rejectsConflict(() => service.acceptRelationship('command-1', 'user-1', 'relationship-1'));
});

test('selection command conflict is rejected before selection and catalog reads', async () => {
  let catalogReads = 0;
  const service = createShowroomSelectionService({
    store: wholesaleStore(conflictingTx({
      getSelection() { throw new Error('protected selection read must not run'); },
    })),
    catalogReader: { async getSku() { catalogReads += 1; } },
  });
  await rejectsConflict(() => service.upsertSelectionLine('command-1', 'user-1', 'selection-1', {
    sku: 'SKU-1',
    quantity: 1,
  }));
  assert.equal(catalogReads, 0);
});

test('order command conflict is rejected before selection reads', async () => {
  const service = createOrderBuilderService({
    store: wholesaleStore(conflictingTx({
      getSelection() { throw new Error('protected selection read must not run'); },
    })),
  });
  await rejectsConflict(() => service.createOrderDraft('command-1', 'user-1', {
    selectionId: 'selection-1',
    terms: { paymentTerms: 'NET30' },
  }));
});

test('catalog command conflict is rejected before collection authorization', async () => {
  const catalogStore = Object.freeze({
    async transaction(work) {
      return work(conflictingTx({
        getCollection() { throw new Error('protected collection read must not run'); },
      }));
    },
    async getSku() { return undefined; },
  });
  const service = createCatalogService({
    catalogStore,
    wholesaleStore: { async transaction() { throw new Error('fallback authorization must not run'); } },
  });
  await rejectsConflict(() => service.createSku('command-1', 'user-1', {
    collectionId: 'collection-1',
    sku: 'SKU-1',
  }));
});

test('notification command conflict is rejected before notification reads', async () => {
  const projectionStore = Object.freeze({
    async transaction(work) {
      return work(conflictingTx({
        getNotification() { throw new Error('protected notification read must not run'); },
      }));
    },
    async snapshot() { return { notifications: [], projections: [], commands: [] }; },
  });
  const service = createNotificationService({
    projectionStore,
    sourceStore: {
      async readOutbox() { return []; },
      async snapshot() { return { memberships: [] }; },
    },
  });
  await rejectsConflict(() => service.markRead('command-1', 'user-1', 'notification-1'));
});
