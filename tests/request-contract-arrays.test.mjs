import assert from 'node:assert/strict';
import test from 'node:test';
import { assertBodyContract, bodyContract } from '../src/http/request-contract.mjs';

const contract = bodyContract(['sku', 'lines'], {}, { lines: ['lineId', 'materialCode', 'quantity'] });

test('strict array contract preserves legacy shape and accepts object items', () => {
  const body = { sku: 'STYLE-001', lines: [{ lineId: 'SHELL', materialCode: 'FAB-001', quantity: 2 }] };
  assert.equal(assertBodyContract(body, contract), body);
  assert.deepEqual(Object.keys(bodyContract(['name'])), ['allowedFields', 'nested']);
});

test('strict array contract rejects non-arrays, primitives and nested unknown fields', () => {
  assert.throws(() => assertBodyContract({ sku: 'STYLE-001', lines: {} }, contract), { code: 'HTTP_BODY_FIELD_INVALID' });
  assert.throws(() => assertBodyContract({ sku: 'STYLE-001', lines: ['FAB-001'] }, contract), { code: 'HTTP_BODY_FIELD_INVALID' });
  assert.throws(
    () => assertBodyContract({ sku: 'STYLE-001', lines: [{ lineId: 'SHELL', materialCode: 'FAB-001', quantity: 2, unitCost: 0.01 }] }, contract),
    (error) => error?.code === 'HTTP_BODY_FIELD_UNKNOWN' && error.details?.field === 'lines' && error.details?.index === 0 && error.details?.unknownFields?.[0] === 'unitCost',
  );
});
