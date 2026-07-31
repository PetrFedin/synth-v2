import { invariant } from '../core/errors.mjs';

export function assertWholesaleStore(store) {
  invariant(store && typeof store.transaction === 'function', 'STORE_TRANSACTION_REQUIRED', 'Wholesale store must implement transaction(work)');
  invariant(typeof store.snapshot === 'function', 'STORE_SNAPSHOT_REQUIRED', 'Wholesale store must implement snapshot()');
  return store;
}
