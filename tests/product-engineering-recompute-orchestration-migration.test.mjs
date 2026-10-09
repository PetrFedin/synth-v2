import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sql = await readFile(new URL('../db/migrations/180_product_engineering_recompute_orchestration.sql', import.meta.url), 'utf8');

test('migration persists exact dependency sets, DAG plans, leased automatic jobs and immutable receipts', () => {
  for (const table of [
    'product_engineering_stale_dependency_sets',
    'product_engineering_recompute_plans',
    'product_engineering_recompute_plan_steps',
    'product_engineering_recompute_jobs',
    'product_engineering_recompute_execution_receipts',
    'product_engineering_recompute_orchestration_receipts',
  ]) assert.match(sql, new RegExp(`CREATE TABLE ${table} \\(`));

  assert.match(sql, /mode IN \('automatic','human_review','external_evidence'\)/);
  assert.match(sql, /job_type text NOT NULL CHECK \(job_type = 'automatic_dispatch'\)/);
  assert.match(sql, /status IN \('queued','running','completed','failed','dead_letter'\)/);
  assert.match(sql, /FOR EACH ROW EXECUTE FUNCTION refuse_product_engineering_recompute_immutable_mutation\(\)/g);
  assert.match(sql, /result_reference IS NOT NULL AND result_verification IS NOT NULL/);
  assert.match(sql, /UNIQUE \(plan_id, step_id\)/);
  assert.match(sql, /product_engineering_recompute_jobs_claim_idx/);
  assert.match(sql, /product_engineering_recompute_jobs_lease_idx/);
});

test('only jobs are mutable; plans, steps and evidence receipts are append-only', () => {
  for (const table of [
    'product_engineering_stale_dependency_sets',
    'product_engineering_recompute_plans',
    'product_engineering_recompute_plan_steps',
    'product_engineering_recompute_execution_receipts',
    'product_engineering_recompute_orchestration_receipts',
  ]) assert.match(sql, new RegExp(`BEFORE UPDATE OR DELETE ON ${table}`));
  assert.doesNotMatch(sql, /BEFORE UPDATE OR DELETE ON product_engineering_recompute_jobs/);
});

test('the migration never grants Product Engineering a generic downstream write surface', () => {
  assert.doesNotMatch(sql, /generic_(?:write|mutation|repository|store)/i);
  assert.doesNotMatch(sql, /UPDATE\s+(?:materials|tech_packs|commercial_publications|commercial_product_projection_versions|product_readiness_snapshots|cost_close_snapshots)/i);
});
