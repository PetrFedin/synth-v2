import { invariant } from './errors.mjs';

export function canonicalJson(value) {
  const serialized = serialize(value, new Set(), false);
  invariant(serialized !== undefined, 'COMMAND_FINGERPRINT_VALUE_INVALID', 'Command fingerprint value must be JSON-serializable');
  return serialized;
}

export function fingerprintsMatch(stored, current) {
  if (stored === current) return true;
  if (typeof stored !== 'string' || typeof current !== 'string') return false;
  return normalizeLegacyFingerprint(stored) === current;
}

function normalizeLegacyFingerprint(value) {
  const starts = [];
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === '{' || value[index] === '[') starts.push(index);
  }
  for (let position = starts.length - 1; position >= 0; position -= 1) {
    const start = starts[position];
    try {
      return `${value.slice(0, start)}${canonicalJson(JSON.parse(value.slice(start)))}`;
    } catch {
      // Continue until the complete legacy JSON suffix is found.
    }
  }
  return value;
}

function serialize(value, seen, arrayItem) {
  if (value === null) return 'null';
  const type = typeof value;
  if (type === 'string' || type === 'boolean') return JSON.stringify(value);
  if (type === 'number') {
    invariant(Number.isFinite(value), 'COMMAND_FINGERPRINT_VALUE_INVALID', 'Command fingerprint numbers must be finite');
    return JSON.stringify(value);
  }
  if (type === 'undefined' || type === 'function' || type === 'symbol') return arrayItem ? 'null' : undefined;
  invariant(type !== 'bigint', 'COMMAND_FINGERPRINT_VALUE_INVALID', 'Command fingerprint values cannot contain bigint');
  if (value instanceof Date) {
    invariant(Number.isFinite(value.getTime()), 'COMMAND_FINGERPRINT_VALUE_INVALID', 'Command fingerprint dates must be valid');
    return JSON.stringify(value.toISOString());
  }
  invariant(!seen.has(value), 'COMMAND_FINGERPRINT_CIRCULAR', 'Command fingerprint values cannot be circular');
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return `[${value.map((item) => serialize(item, seen, true)).join(',')}]`;
    }
    const fields = [];
    for (const key of Object.keys(value).sort()) {
      const nested = serialize(value[key], seen, false);
      if (nested !== undefined) fields.push(`${JSON.stringify(key)}:${nested}`);
    }
    return `{${fields.join(',')}}`;
  } finally {
    seen.delete(value);
  }
}
