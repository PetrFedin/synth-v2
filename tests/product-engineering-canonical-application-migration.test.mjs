import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sql=await readFile(new URL('../db/migrations/174_product_engineering_canonical_application_authority.sql',import.meta.url),'utf8');

test('canonical application authority persists immutable intent and receipt evidence',()=>{
  for(const fragment of [
    'CREATE TABLE product_engineering_application_intents',
    'proposal_id text NOT NULL UNIQUE',
    'precondition_snapshot jsonb NOT NULL',
    'precondition_hash char(64) NOT NULL',
    'deterministic_diff jsonb NOT NULL',
    'intent_hash char(64) NOT NULL UNIQUE',
    'CREATE TABLE product_engineering_application_receipts',
    'intent_id text NOT NULL UNIQUE',
    'intent_hash char(64) NOT NULL',
    'resulting_canonical_version integer NOT NULL',
    'result_snapshot jsonb NOT NULL',
    'receipt_hash char(64) NOT NULL UNIQUE',
  ]) assert.ok(sql.includes(fragment),fragment);
  assert.equal(/ON DELETE CASCADE/.test(sql),false,'application proof must not disappear through cascading deletion');
});
