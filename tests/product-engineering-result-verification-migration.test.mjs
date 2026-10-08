import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sql=await readFile(new URL('../db/migrations/179_product_engineering_verified_result_references.sql',import.meta.url),'utf8');

test('verified result migration persists independent canonical verification without weakening waiver semantics',()=>{
  for(const fragment of [
    'ADD COLUMN result_verification jsonb NULL',
    "CHECK (result_verification IS NULL OR jsonb_typeof(result_verification) = 'object')",
    "(disposition = 'waived' AND result_verification IS NULL)",
  ]) assert.ok(sql.includes(fragment),fragment);
});
