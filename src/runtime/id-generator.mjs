import { randomUUID } from 'node:crypto';
import { invariant } from '../core/errors.mjs';

const PREFIX_PATTERN = /^[a-z][a-z0-9-]{0,31}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createRuntimeIdGenerator({ randomUuid = randomUUID } = {}) {
  invariant(typeof randomUuid === 'function', 'RUNTIME_ID_SOURCE_INVALID', 'Runtime UUID source is required');
