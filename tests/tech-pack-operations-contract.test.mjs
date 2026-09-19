import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { MACHINE_CLASSES, createTechPackOperation, totalStandardMinutes } from '../src/modules/tech-pack-operations/public.mjs';

const read = (relativePath) => readFile(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), 'utf8');
const techPack = Object.freeze({ techPackCode: 'TP-1', brandId: 'brand-1', status: 'draft' });
const base = Object.freeze({
  id: 'operation-1', techPack, sequence: 1, operationCode: 'OP-SIDE',
  nameRu: 'Стачать боковые швы', nameEn: 'Join the side seams',
  equipment: 'JUKI DDL-8700', machineClass: 'lockstitch', standardMinutes: 2.5,
  createdAt: '2026-09-19T10:00:00.000Z', createdBy: 'actor-1',
});

test('an operation names the machine it needs and how long it takes', () => {
  const operation = createTechPackOperation(base);
  assert.equal(operation.machineClass, 'lockstitch');
  assert.equal(operation.standardMinutes, 2.5);
  assert.ok(MACHINE_CLASSES.includes(operation.machineClass));
});

test('a standard time of zero is a missing measurement, not a fast operation', () => {
  // Accepting zero would quietly shorten the sequence the make cost is derived from.
  for (const standardMinutes of [0, -1, 601, '2.5', Number.NaN]) {
    assert.throws(
      () => createTechPackOperation({ ...base, standardMinutes }),
      (error) => error.code === 'TECH_PACK_OPERATION_STANDARD_MINUTES_INVALID',
      `standardMinutes ${String(standardMinutes)} must be refused`,
    );
  }
});

test('the sequence is closed once the tech pack leaves draft', () => {
  // An issued pack is what a factory quoted and committed against; changing its operations would
  // change the document without changing its revision.
  for (const status of ['issued', 'acknowledged', 'superseded', 'withdrawn']) {
    assert.throws(
      () => createTechPackOperation({ ...base, techPack: { ...techPack, status } }),
      (error) => error.code === 'TECH_PACK_NOT_DRAFT',
    );
  }
});

test('an unknown machine class is refused rather than stored as free text', () => {
  assert.throws(
    () => createTechPackOperation({ ...base, machineClass: 'laser' }),
    (error) => error.code === 'TECH_PACK_OPERATION_MACHINE_CLASS_INVALID',
  );
});

test('the standard time of a sequence is derived, never stored', () => {
  assert.equal(totalStandardMinutes([{ standardMinutes: 6.4 }, { standardMinutes: 1.8 }, { standardMinutes: 2.5 }]), 10.7);
  assert.equal(totalStandardMinutes([]), 0);
  assert.equal(totalStandardMinutes(null), 0);
});

test('the database closes the sequence too, and keeps two operations out of one place', async () => {
  const sql = await read('db/migrations/089_tech_pack_operations.sql');
  assert.match(sql, /assert_tech_pack_operations_draft_only/);
  assert.match(sql, /BEFORE INSERT OR UPDATE OR DELETE ON tech_pack_operations/);
  assert.match(sql, /UNIQUE \(tech_pack_code, sequence\)/);
  assert.match(sql, /UNIQUE \(tech_pack_code, operation_code\)/);
  assert.match(sql, /standard_minutes > 0/);
});

test('the document is assembled by the read model, not by the client', async () => {
  const sql = await read('db/migrations/090_tech_pack_document_workspace.sql');
  assert.match(sql, /CREATE OR REPLACE VIEW tech_pack_document_workspace/);
  for (const key of ["'materials'", "'measurementSizes'", "'measurementPoints'", "'operations'", "'standardMinutes'"]) {
    assert.ok(sql.includes(key), `the document must carry ${key}`);
  }
  // Only a published BOM and a published chart belong in a document a factory works from.
  assert.match(sql, /bom\.status = 'published'/);
  assert.match(sql, /chart_row\.status = 'published'/);
});
