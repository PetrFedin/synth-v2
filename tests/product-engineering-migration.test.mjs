import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sql=await readFile(new URL('../db/migrations/165_ai_product_engineering_authority.sql',import.meta.url),'utf8');

test('migration creates a proposal/evidence layer without a second canonical PLM',()=>{
  for(const table of ['product_engineering_analysis_runs','ai_model_runs','product_engineering_findings','product_engineering_evidence','product_engineering_proposals','product_engineering_conflicts','technical_drawing_versions','technical_drawing_objects']){
    assert.match(sql,new RegExp(`CREATE TABLE ${table}\\b`));
  }
  assert.match(sql,/product-engineering/);
  assert.match(sql,/FOREIGN KEY \(id\) REFERENCES command_registry\(id\)/);
  for(const canonical of ['product_style_versions','measurement_charts','boms','tech_packs','samples']){
    assert.doesNotMatch(sql,new RegExp(`UPDATE\\s+${canonical}\\b`,'i'),`migration must not write canonical ${canonical}`);
  }
  assert.match(sql,/accepted proposal is not equivalent|Acceptance is not equivalent/i);
});

test('technical drawings are versioned and only one approved view can be current',()=>{
  assert.match(sql,/UNIQUE \(style_id, view_type, version_no\)/);
  assert.match(sql,/CREATE UNIQUE INDEX technical_drawing_one_approved_view_idx/);
  assert.match(sql,/WHERE status = 'approved'/);
  assert.match(sql,/measurement_anchor/);
  assert.match(sql,/construction_callout/);
});
