import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sql=await readFile(new URL('../db/migrations/175_product_engineering_change_impact.sql',import.meta.url),'utf8');

test('change impact migration preserves source history and persists deterministic impact workflow',()=>{
  for(const fragment of [
    'CREATE TABLE product_engineering_source_revisions',
    'superseded_source_id text NOT NULL UNIQUE',
    'replacement_source_id text NOT NULL UNIQUE',
    'superseded_content_hash char(64) NOT NULL',
    'replacement_content_hash char(64) NOT NULL',
    'CREATE TABLE product_engineering_change_cases',
    "status text NOT NULL CHECK (status IN ('open','acknowledged','resolved'))",
    'impact_snapshot jsonb NOT NULL',
    'impact_hash char(64) NOT NULL UNIQUE',
    'CREATE TABLE product_engineering_change_impacts',
    "evidence_status text NOT NULL CHECK (evidence_status IN ('observed','derived','policy_required'))",
    "status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','acknowledged','resolved'))",
  ]) assert.ok(sql.includes(fragment),fragment);
  assert.equal(/ON DELETE CASCADE/.test(sql),false,'historical source revision and impact evidence must not cascade away');
});
