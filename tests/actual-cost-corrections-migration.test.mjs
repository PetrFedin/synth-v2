import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('actual cost correction migration enforces append-only reversal integrity without rewriting ledger history', async () => {
  const sql = await readFile(path.join(root, 'db', 'migrations', '034_actual_cost_corrections.sql'), 'utf8');
  assert.match(sql, /ADD COLUMN entry_kind TEXT NOT NULL DEFAULT 'actual'/);
  assert.match(sql, /ADD COLUMN reversal_of_entry_id TEXT NULL/);
  assert.match(sql, /ADD COLUMN correction_id TEXT NULL/);
  assert.match(sql, /ADD COLUMN correction_reason TEXT NULL/);
  assert.match(sql, /entry_kind IN \('actual', 'reversal'\)/);
  assert.match(sql, /FOREIGN KEY \(reversal_of_entry_id\)\s+REFERENCES actual_cost_ledger_entries\(id\)/s);
  assert.match(sql, /CREATE UNIQUE INDEX actual_cost_one_reversal_per_entry_idx/);
  assert.match(sql, /CREATE UNIQUE INDEX actual_cost_one_kind_per_correction_idx/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION validate_actual_cost_reversal\(\)/);
  assert.match(sql, /ACTUAL_COST_REVERSAL_OF_REVERSAL_FORBIDDEN/);
  assert.match(sql, /ACTUAL_COST_REVERSAL_LINEAGE_MISMATCH/);
  assert.match(sql, /NEW\.source_amount <> -original\.source_amount/);
  assert.match(sql, /NEW\.amount <> -original\.amount/);
  assert.match(sql, /CREATE TRIGGER actual_cost_reversal_integrity_gate/);
  assert.doesNotMatch(sql, /UPDATE\s+actual_cost_ledger_entries/i);
  assert.doesNotMatch(sql, /DELETE\s+FROM\s+actual_cost_ledger_entries/i);
});
