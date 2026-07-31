import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { invariant } from '../core/errors.mjs';

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;
const PREFIX = 'scrypt-v1';

export async function hashPassword(password, { randomBytesImpl = randomBytes } = {}) {
  assertPassword(password);
  const salt = randomBytesImpl(16);
  const derived = await scrypt(password, salt, KEY_LENGTH);
  return `${PREFIX}$${Buffer.from(salt).toString('hex')}$${Buffer.from(derived).toString('hex')}`;
}

export async function verifyPassword(password, encoded) {
  if (typeof password !== 'string' || typeof encoded !== 'string') return false;
  const [prefix, saltHex, hashHex, ...rest] = encoded.split('$');
  if (prefix !== PREFIX || rest.length || !/^[a-f0-9]{32}$/i.test(saltHex ?? '') || !/^[a-f0-9]{128}$/i.test(hashHex ?? '')) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = Buffer.from(await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function assertPassword(password) {
  invariant(typeof password === 'string' && password.length >= 12 && password.length <= 1024, 'AUTH_PASSWORD_INVALID', 'Password must contain between 12 and 1024 characters');
}
