import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEngineeringSourceStructure } from '../src/modules/product-engineering/structural-parser.mjs';
import { createBaselineEngineeringScanner } from '../src/modules/product-engineering/baseline-scanner.mjs';

function blob(mediaType,text,hash='a'.repeat(64)){return {content:new TextEncoder().encode(text),contentHash:hash,mediaType};}
function source(mediaType,hash='a'.repeat(64)){return {id:'s1',mediaType,contentHash:hash};}

test('CSV structural parser emits sheet and addressable cell range',()=>{
  const b=blob('text/csv','Size,Chest\nS,50\nM,52');
  const parsed=parseEngineeringSourceStructure({source:source('text/csv'),blob:b});
  assert.equal(parsed.parser,'csv-structure');
  assert.equal(parsed.fragments[1].kind,'cell_range');
  assert.equal(parsed.fragments[1].locator.range,'A1:B3');
});

test('PDF structural parser emits deterministic page locators without pretending to extract semantic text',()=>{
  const pdf='%PDF-1.7\n1 0 obj <</Type /Page>> endobj\n2 0 obj <</Type /Page>> endobj';
  const parsed=parseEngineeringSourceStructure({source:source('application/pdf'),blob:blob('application/pdf',pdf)});
  assert.equal(parsed.fragments.filter(x=>x.kind==='document_page').length,2);
  assert.equal(parsed.fragments[0].content.semanticTextExtracted,false);
});

test('baseline scanner detects EICAR test signature and identifies its limited assurance',async()=>{
  const scanner=createBaselineEngineeringScanner();
  assert.equal(scanner.productionMalwareScanner,false);
  const content='X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
  const result=await scanner.scan({source:source('application/pdf'),blob:blob('application/pdf',content)});
  assert.equal(result.status,'infected');
  assert.equal(result.allowAdmission,false);
});
