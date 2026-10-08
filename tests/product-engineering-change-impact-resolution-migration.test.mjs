import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sql=await readFile(new URL('../db/migrations/178_product_engineering_change_impact_resolution_receipts.sql',import.meta.url),'utf8');

test('impact closure migration adds optimistic versioning and immutable resolution/waiver receipts',()=>{
  for(const fragment of [
    'ADD COLUMN version integer NOT NULL DEFAULT 1',
    "CHECK (status IN ('pending','acknowledged','resolved','waived'))",
    'CREATE TABLE product_engineering_change_impact_receipts',
    'impact_id text NOT NULL UNIQUE',
    "disposition text NOT NULL CHECK (disposition IN ('resolved','waived'))",
    'previous_impact_version integer NOT NULL',
    'resulting_impact_version integer NOT NULL',
    'evidence jsonb NOT NULL',
    'result_reference jsonb NULL',
    'waiver jsonb NULL',
    'receipt_hash char(64) NOT NULL UNIQUE',
  ]) assert.ok(sql.includes(fragment),fragment);
  assert.equal(/ON DELETE CASCADE/.test(sql),false);
});
