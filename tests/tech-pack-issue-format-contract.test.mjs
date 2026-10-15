import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const read=p=>readFile(fileURLToPath(new URL('../'+p,import.meta.url)),'utf8');
test('canonical issue format persists outside dependencySnapshot',async()=>{
  const m=await read('db/migrations/181_tech_pack_issue_format_and_sketch_evidence.sql');
  const s=await read('src/infrastructure/postgres-tech-pack-store.mjs');
  const r=await read('src/infrastructure/postgres-tech-pack-reader.mjs');
  assert.match(m,/ADD COLUMN IF NOT EXISTS issue_format text NOT NULL DEFAULT 'legacy'/);
  assert.match(m,/CHECK \(issue_format IN \('legacy', 'canonical-v1'\)\)/);
  assert.match(s,/issue_format=\$8/);
  assert.match(r,/pack\.issue_format/);
  assert.match(r,/canonicalFormat/);
});
test('retained sketch content and publication rights are distinct authorities',async()=>{
  const m=await read('db/migrations/181_tech_pack_issue_format_and_sketch_evidence.sql');
  assert.match(m,/CREATE TABLE IF NOT EXISTS product_media_retained_assets/);
  assert.match(m,/Retained asset hash must match immutable ProductMedia content_hash/);
  assert.match(m,/CREATE TABLE IF NOT EXISTS product_media_publication_rights/);
  assert.match(m,/status IN \('cleared','restricted','expired','revoked'\)/);
});
