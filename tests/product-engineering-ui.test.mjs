import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const [script,html]=await Promise.all([
  read('public/modules/product-engineering.js'),
  read('public/index.html'),
]);

test('Product Engineering uses the platform form contract rather than the incompatible object-style call',()=>{
  assert.doesNotMatch(script,/openForm\s*\(\s*\{/);
  assert.match(script,/openForm\(\s*text\('Новый инженерный анализ'/);
  assert.match(script,/selectDef\('purpose'/);
  assert.match(script,/textDef\(\s*'objective'/);
  assert.match(script,/optionalTextDef\('note'/);
});

test('accepted proposals expose separate Impact and Apply actions without collapsing review into mutation',()=>{
  assert.match(script,/\/v2\/product-engineering\/proposals\/\$\{encodeURIComponent\(proposal\.id\)\}\/impact/);
  assert.match(script,/\/v2\/product-engineering\/proposals\/\$\{encodeURIComponent\(proposal\.id\)\}\/apply/);
  assert.match(script,/expectedProposalVersion:\s*proposal\.version/);
  assert.match(script,/expectedCanonicalVersion:\s*values\.expectedCanonicalVersion/);
  assert.match(script,/APPLY_ACTIONS\.has\(key\)/);
  assert.match(script,/proposal\.appliedReference/);
  assert.match(script,/Accept the proposal in review\. This does not yet mutate the canonical entity/);
});

test('impact UI distinguishes unavailable evidence from observed and derived evidence',()=>{
  assert.match(script,/evidence\.status === 'not_available'/);
  assert.match(script,/evidence\.status === 'derived'/);
  assert.match(script,/data not available in this reader/);
  assert.match(script,/Pre-apply change impact/);
});

test('Product Engineering asset is cache-busted after Review Impact Apply UI change',()=>{
  assert.match(html,/\/ui\/product-engineering\.js\?v=engineering-20261006-2/);
});
