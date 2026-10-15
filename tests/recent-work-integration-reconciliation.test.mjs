import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));

test('recent reconciliation keeps Tech Pack 181 and Human Review 182 as distinct ordered migrations',async()=>{
  const files=(await readdir(root+'db/migrations')).filter(name=>/^18[0-9]_/.test(name)).sort();
  assert.ok(files.includes('181_tech_pack_issue_format_and_sketch_evidence.sql'));
  assert.ok(files.includes('182_recompute_human_review_authority.sql'));
  assert.equal(files.filter(name=>name.startsWith('181_')).length,1);
  assert.equal(files.filter(name=>name.startsWith('182_')).length,1);
  const human=await readFile(root+'db/migrations/182_recompute_human_review_authority.sql','utf8');
  assert.match(human,/product_engineering_recompute_review_assignments/);
  assert.match(human,/product_engineering_recompute_review_decisions/);
});

test('reconciliation does not remove Tech Pack canonical migration while adding Human Review',async()=>{
  const tech=await readFile(root+'db/migrations/181_tech_pack_issue_format_and_sketch_evidence.sql','utf8');
  const human=await readFile(root+'db/migrations/182_recompute_human_review_authority.sql','utf8');
  assert.match(tech,/issue_format/);
  assert.match(tech,/product_media_publication_rights/);
  assert.match(human,/assignment_hash/);
  assert.match(human,/receipt_hash/);
});
