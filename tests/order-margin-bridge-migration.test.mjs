import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('margin bridge view derives explainability from immutable economic records only', async () => {
  const sql = await readFile(path.join(root, 'db', 'migrations', '040_order_margin_bridge_view.sql'), 'utf8');

  assert.match(sql, /CREATE OR REPLACE VIEW order_margin_bridge_steps AS/);
  assert.match(sql, /JOIN cost_close_snapshots AS close/);
  assert.match(sql, /FROM post_close_adjustments AS adjustment/);
  assert.match(sql, /JOIN actual_cost_ledger_entries AS actual/);
  assert.match(sql, /LEFT JOIN order_fx_rate_snapshots AS fx/);
  assert.match(sql, /JOIN landed_cost_snapshots AS prior_landed/);
  assert.match(sql, /JOIN landed_cost_snapshots AS current_landed/);
  assert.match(sql, /JOIN margin_actualization_snapshots AS prior_margin/);
  assert.match(sql, /JOIN margin_actualization_snapshots AS current_margin/);
  assert.match(sql, /row_number\(\) OVER/);
  assert.match(sql, /sum\(adjustment\.cost_delta_amount\) OVER/);
  assert.match(sql, /sum\(adjustment\.margin_delta_amount\) OVER/);
  assert.match(sql, /actual\.source_amount/);
  assert.match(sql, /actual\.source_currency/);
  assert.match(sql, /fx\.rate AS fx_rate/);
  assert.match(sql, /adjustment\.reason/);
  assert.match(sql, /close\.total_landed_cost AS base_landed_cost/);
  assert.match(sql, /close\.contribution_margin_amount AS base_contribution_margin_amount/);

  assert.doesNotMatch(sql, /INSERT\s+INTO\s+order_margin_bridge/i);
  assert.doesNotMatch(sql, /UPDATE\s+(cost_close_snapshots|post_close_adjustments|actual_cost_ledger_entries|landed_cost_snapshots|margin_actualization_snapshots)/i);
  assert.doesNotMatch(sql, /DELETE\s+FROM\s+(cost_close_snapshots|post_close_adjustments|actual_cost_ledger_entries|landed_cost_snapshots|margin_actualization_snapshots)/i);
});
