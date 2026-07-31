import { createWholesalePlatform } from '../application/platform.mjs';
import { createMemoryWholesaleStore } from './memory-store.mjs';

export function createInMemoryWholesalePlatform(options = {}) {
  const store = options.store ?? createMemoryWholesaleStore();
  return Object.freeze({
    store,
    platform: createWholesalePlatform({ ...options, store }),
  });
}
