import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { invariant } from '../core/errors.mjs';

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 1024;
const PREFIX = 'scrypt-v1';

export async function hashPassword(password, { randomBytesImpl = randomBytes } = {}) {
  assertPassword(password);
  invariant(typeof randomBytesImpl === 'function', 'AUTH_RANDOM_SOURCE_INVALID', 'Secure random byte generator is required');
  const salt = randomBuffer(randomBytesImpl, SALT_LENGTH);
  const derived = await scrypt(password, salt, KEY_LENGTH);
  return `${PREFIX}$${salt.toString('hex')}$${Buffer.from(derived).toString('hex')}`;
}

export async function verifyPassword(password, encoded) {
  if (!isPasswordLengthValid(password) || typeof encoded !== 'string') return false;
  const [prefix, saltHex, hashHex, ...rest] = encoded.split('$');
  if (prefix !== PREFIX || rest.length || !/^[a-f0-9]{32}$/i.test(saltHex ?? '') || !/^[a-f0-9]{128}$/i.test(hashHex ?? '')) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = Buffer.from(await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function assertPassword(password) {
  invariant(isPasswordLengthValid(password), 'AUTH_PASSWORD_INVALID', `Password must contain between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters`);
}

function isPasswordLengthValid(password) {
  return typeof password === 'string' && password.length >= MIN_PASSWORD_LENGTH && password.length <= MAX_PASSWORD_LENGTH;
}

function randomBuffer(randomBytesImpl, length) {
  let value;
  try { value = randomBytesImpl(length); }
  catch { invariant(false, 'AUTH_RANDOM_SOURCE_INVALID', 'Secure random byte generator failed'); }
  invariant(value instanceof Uint8Array && value.byteLength === length, 'AUTH_RANDOM_SOURCE_INVALID', `Secure random byte generator must return exactly ${length} bytes`);
  return Buffer.from(value);
}
