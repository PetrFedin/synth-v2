import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRecomputeHumanReviewAuthority } from '../src/application/product-engineering-human-review-authority.mjs';

const migration=await readFile(new URL('../db/migrations/181_recompute_human_review_authority.sql',import.meta.url),'utf8');
test('review tables are append-only and tied to admitted DAG plan steps',()=>{
 for(const name of ['product_engineering_recompute_review_assignments','product_engineering_recompute_review_decisions']){
   assert.match(migration,new RegExp(`CREATE TABLE ${name}`));
   assert.match(migration,new RegExp(`BEFORE UPDATE OR DELETE ON ${name}`));
 }
 assert.match(migration,/FOREIGN KEY \(plan_id,step_id\) REFERENCES product_engineering_recompute_plan_steps/);
 assert.match(migration,/UNIQUE \(plan_id,step_id\)/);
});
test('generic evidence does not decide and there is no mutation or runtime handler',()=>{
 let commands=0;
 const pool={
  query:async()=>{commands++;throw Error('Unexpected query');},
  connect:async()=>({query:async()=>{commands++;throw Error('Unexpected query');},release:async()=>{}}),
 };
 const service=createRecomputeHumanReviewAuthority({pool});
 assert.deepEqual(Object.keys(service).sort(),['assign','decide']);
 assert.equal(commands,0);
});
test('empty evidence, non-explicit decision, or missing idempotency key fails before SQL',async()=>{
 let calls=0;
 const pool={query:async()=>{calls++;return {rows:[]}},connect:async()=>({query:async()=>{calls++;return {rows:[]}},release:async()=>{}})};
 const service=createRecomputeHumanReviewAuthority({pool});
 for(const input of [
  {planId:'p',stepId:'s',actorId:'u',decision:'accepted',rationale:'reviewed',evidence:[],commandId:'cmd'},
  {planId:'p',stepId:'s',actorId:'u',decision:'approved',rationale:'reviewed',evidence:[{type:'review'}],commandId:'cmd'},
  {planId:'p',stepId:'s',actorId:'u',decision:'accepted',rationale:'reviewed',evidence:[{type:'review'}],commandId:''},
 ])await assert.rejects(service.decide(input));
 assert.equal(calls,0);
});
