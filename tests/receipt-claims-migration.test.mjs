import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migration = await fs.readFile(path.join(root, 'db', 'migrations', '046_receipt_discrepancy_claims.sql'), 'utf8');

test('claim migration pins exact discrepancy identity and one claim per discrepancy', () => {
  assert.match(migration, /CREATE TABLE receipt_discrepancy_claim_snapshots/);
  assert.match(migration, /receipt_discrepancy_content_hash/);
  assert.match(migration, /CONSTRAINT receipt_claim_discrepancy_fk FOREIGN KEY/);
  assert.match(migration, /UNIQUE \(receipt_discrepancy_snapshot_id\)/);
  assert.match(migration, /UNIQUE \(shop_id, claim_reference\)/);
});

test('database only accepts finalized open discrepancy and derives exact issue lines', () => {
  assert.match(migration, /discrepancy\.finalized IS DISTINCT FROM TRUE/);
  assert.match(migration, /discrepancy\.status <> 'open'/);
  assert.match(migration, /jsonb_array_elements\(discrepancy\.lines\) WITH ORDINALITY/);
  assert.match(migration, /MESSAGE = 'RECEIPT_CLAIM_ISSUE_LINES_MISMATCH'/);
  assert.match(migration, /NEW\.lines <> issue_lines/);
});

test('claim and resolution snapshots are immutable and resolution is unique', () => {
  assert.match(migration, /CREATE TABLE receipt_claim_resolution_snapshots/);
  assert.match(migration, /claim_snapshot_id TEXT NOT NULL UNIQUE/);
  assert.match(migration, /CREATE TRIGGER receipt_claim_immutable_update/);
  assert.match(migration, /CREATE TRIGGER receipt_claim_resolution_immutable_update/);
  assert.match(migration, /MESSAGE = 'RECEIPT_CLAIM_SNAPSHOT_IMMUTABLE'/);
});
