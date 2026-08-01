import { randomUUID } from 'node:crypto';
import { invariant } from '../core/errors.mjs';

const PREFIX_PATTERN = /^[a-z][a-z0-9-]{0,31}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createRuntimeIdGenerator({ randomUuid = randomUUID } = {}) {
  invariant(typeof randomUuid === 'function', 'RUNTIME_ID_SOURCE_INVALID', 'Runtime UUID source is required');
  return (prefix) => {
    invariant(PREFIX_PATTERN.test(prefix ?? ''), 'RUNTIME_ID_PREFIX_INVALID', 'Runtime id prefix must contain 1 to 32 lowercase letters, numbers or dashes');
    let uuid;
    try { uuid = String(randomUuid()).trim().toLowerCase(); }
    catch { invariant(false, 'RUNTIME_ID_SOURCE_INVALID', 'Runtime UUID source failed'); }
    invariant(UUID_PATTERN.test(uuid), 'RUNTIME_ID_SOURCE_INVALID', 'Runtime UUID source must return an RFC 4122 UUID');
    return `${prefix}_${uuid}`;
  };
}

export function resolveRuntimeIdGenerator(nextId) {
  if (nextId === undefined) return createRuntimeIdGenerator();
  invariant(typeof nextId === 'function', 'RUNTIME_ID_GENERATOR_INVALID', 'Runtime id generator must be a function');
  return nextId;
}
