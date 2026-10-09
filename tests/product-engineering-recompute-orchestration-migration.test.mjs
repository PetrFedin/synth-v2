import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sql=await readFile(new URL('../db/migrations/180_product_engineering_recompute_orchestration.sql',import.meta.url),'utf8');

test('recompute orchestration migration persists immutable dependency, plan, execution and final receipts',()=>{
  for(const fragment of [
    'CREATE TABLE product_engineering_recompute_dependency_sets',
    'dependency_set_hash char(64) NOT NULL UNIQUE',
    'CREATE TABLE product_engineering_recompute_plans',
    "status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','completed','blocked'))",
    'CREATE TABLE product_engineering_recompute_execution_receipts',
    'impact_id text NOT NULL REFERENCES product_engineering_change_impacts(id) ON DELETE RESTRICT',
    'UNIQUE (plan_id, step_id)',
    'CREATE TABLE product_engineering_recompute_orchestration_receipts',
    'plan_id text NOT NULL UNIQUE',
    'execution_receipt_hashes jsonb NOT NULL',
    'admission_hash char(64) NOT NULL',
  ]) assert.ok(sql.includes(fragment),fragment);
  assert.equal(/ON DELETE CASCADE/.test(sql),false,'recompute evidence must never cascade away');
});
