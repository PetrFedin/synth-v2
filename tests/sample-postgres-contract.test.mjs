import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sql = await readFile(path.join(root, 'db', 'migrations', '018_samples.sql'), 'utf8');

test('Samples migration persists one versioned lifecycle aggregate with next-round traceability', () => {
  for (const fragment of [
    'CREATE TABLE IF NOT EXISTS samples',
    'sample_code text NOT NULL UNIQUE',
    'sku text NOT NULL REFERENCES catalog_skus(sku)',
    'sku_version integer NOT NULL CHECK (sku_version > 0)',
    "sample_type text NOT NULL CHECK (sample_type IN ('proto','fit','size-set','pre-production','sales','photo'))",
    "status text NOT NULL CHECK (status IN ('draft','requested','in-production','received','approved','rejected','cancelled'))",
    'round integer NOT NULL CHECK (round BETWEEN 1 AND 100)',
    'UNIQUE (sku, sample_type, round)',
    'UNIQUE (source_sample_code)',
    'samples_state_timestamps_check',
    'samples_time_order_check',
    'samples_overdue_work_idx',
  ]) assert.ok(sql.includes(fragment), fragment);
});

test('Samples lifecycle constraints prevent impossible normalized states', () => {
  assert.match(sql, /status = 'draft' AND requested_at IS NULL/);
  assert.match(sql, /status = 'in-production' AND requested_at IS NOT NULL AND production_started_at IS NOT NULL/);
  assert.match(sql, /status IN \('approved','rejected'\) AND requested_at IS NOT NULL AND received_at IS NOT NULL AND decision_at IS NOT NULL/);
  assert.match(sql, /due_at > requested_at/);
  assert.match(sql, /source_sample_code IS NULL OR source_sample_code <> sample_code/);
});
