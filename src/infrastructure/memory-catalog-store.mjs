import { invariant } from '../core/errors.mjs';

export function createMemoryCatalogStore() {
  let state = { skus: new Map(), commands: new Map(), outbox: new Map() };
  let tail = Promise.resolve();
  function transaction(work) {
    const run = tail.then(async () => {
      const draft = { skus: new Map(state.skus), commands: new Map(state.commands), outbox: new Map(state.outbox) };
      const result = await work(view(draft));
      state = draft;
      return result;
    });
    tail = run.catch(() => undefined);
    return run;
  }
  return Object.freeze({
    transaction,
    getSku: async (sku) => state.skus.get(sku),
    snapshot: () => Object.freeze({ skus: [...state.skus.values()], commands: [...state.commands.values()], outbox: [...state.outbox.values()] }),
  });
}

function view(state) {
  return Object.freeze({
    getSku: async (sku) => state.skus.get(sku),
    insertSku: async (value) => { invariant(!state.skus.has(value.sku), 'CATALOG_SKU_ALREADY_EXISTS', 'Catalog SKU already exists', { sku: value.sku }); state.skus.set(value.sku, value); },
    saveSku: async (value, expectedVersion) => {
      const current = state.skus.get(value.sku);
      invariant(current?.version === expectedVersion, 'CATALOG_SKU_CONCURRENCY_CONFLICT', 'Catalog SKU concurrency conflict', { sku: value.sku, expectedVersion, actualVersion: current?.version });
      invariant(value.version === expectedVersion + 1, 'VERSION_INCREMENT_INVALID', 'Version must increment exactly once');
      state.skus.set(value.sku, value);
    },
    getCommand: async (id) => state.commands.get(id),
    insertCommand: async (value) => { invariant(!state.commands.has(value.id), 'COMMAND_ALREADY_EXISTS', 'Command already exists'); state.commands.set(value.id, value); },
    appendOutbox: async (event) => { invariant(!state.outbox.has(event.id), 'OUTBOX_EVENT_ALREADY_EXISTS', 'Outbox event already exists'); state.outbox.set(event.id, Object.freeze({ event, status: 'pending', publishedAt: null })); },
  });
}
