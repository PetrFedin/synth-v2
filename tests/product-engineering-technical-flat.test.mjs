import test from 'node:test';
import assert from 'node:assert/strict';
import { assertTechnicalFlatApprovable, validateTechnicalFlat } from '../src/modules/product-engineering/technical-flat.mjs';

const drawing={id:'d1',viewType:'front'};
const object=(id,objectType,extra={})=>({id,drawingId:'d1',objectType,semanticCode:null,garmentNodeId:null,geometry:{},confidence:1,...extra});

test('technical flat approval requires an outline',()=>{
  const result=validateTechnicalFlat({drawing,objects:[object('p','panel')]});
  assert.equal(result.valid,false);
  assert.ok(result.issues.some(x=>x.code==='TECHNICAL_FLAT_OUTLINE_REQUIRED'));
});

test('measurement anchors need semantic lineage and valid line geometry',()=>{
  const result=validateTechnicalFlat({drawing,objects:[
    object('o','outline'),
    object('m','measurement_anchor',{semanticCode:'POM.CHEST_WIDTH',geometry:{x1:10,y1:20,x2:90,y2:20}}),
  ]});
  assert.equal(result.valid,true);
  assert.doesNotThrow(()=>assertTechnicalFlatApprovable({drawing,objects:[
    object('o','outline'),
    object('m','measurement_anchor',{garmentNodeId:'node-pom-chest',geometry:{points:[[10,20],[90,20]]}}),
  ]}));
});

test('critical callout without semantic code or garment graph link blocks approval',()=>{
  const result=validateTechnicalFlat({drawing,objects:[
    object('o','outline'),
    object('c','construction_callout',{geometry:{x:12,y:10}}),
  ]});
  assert.equal(result.valid,false);
  assert.ok(result.issues.some(x=>x.code==='TECHNICAL_FLAT_CRITICAL_LINK_REQUIRED'));
});
