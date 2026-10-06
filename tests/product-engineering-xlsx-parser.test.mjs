import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEngineeringSourceStructure } from '../src/modules/product-engineering/structural-parser.mjs';

test('XLSX structural parser reads real workbook names, inline strings and used cell range',()=>{
  const zip=createStoredZip({
    'xl/workbook.xml':'<?xml version="1.0"?><workbook xmlns:r="urn:r"><sheets><sheet name="Measurements" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels':'<?xml version="1.0"?><Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml':'<?xml version="1.0"?><worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Size</t></is></c><c r="B1" t="inlineStr"><is><t>Chest</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>M</t></is></c><c r="B2"><v>52</v></c></row></sheetData></worksheet>',
  });
  const hash='a'.repeat(64);
  const parsed=parseEngineeringSourceStructure({
    source:{id:'xlsx-1',mediaType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',contentHash:hash},
    blob:{content:zip,contentHash:hash},
  });
  assert.equal(parsed.parser,'xlsx-structure');
  assert.deepEqual(parsed.fragments[0].content.sheetNames,['Measurements']);
  const sheet=parsed.fragments.find(fragment=>fragment.kind==='sheet');
  assert.equal(sheet.locator.sheet,'Measurements');
  assert.equal(sheet.content.usedRange,'A1:B2');
  const cells=parsed.fragments.find(fragment=>fragment.kind==='cell_range');
  assert.equal(cells.locator.range,'A1:B2');
  assert.deepEqual(cells.content.cells.map(cell=>[cell.ref,cell.value]),[
    ['A1','Size'],['B1','Chest'],['A2','M'],['B2',52],
  ]);
});

function createStoredZip(files){
  const encoder=new TextEncoder();
  const locals=[]; const centrals=[]; let offset=0;
  for(const [name,text] of Object.entries(files)){
    const fileName=encoder.encode(name);
    const data=encoder.encode(text);
    const local=new Uint8Array(30+fileName.length+data.length);
    const lv=new DataView(local.buffer);
    lv.setUint32(0,0x04034b50,true);
    lv.setUint16(4,20,true);
    lv.setUint16(6,0,true);
    lv.setUint16(8,0,true);
    lv.setUint32(14,0,true);
    lv.setUint32(18,data.length,true);
    lv.setUint32(22,data.length,true);
    lv.setUint16(26,fileName.length,true);
    lv.setUint16(28,0,true);
    local.set(fileName,30);
    local.set(data,30+fileName.length);
    locals.push(local);

    const central=new Uint8Array(46+fileName.length);
    const cv=new DataView(central.buffer);
    cv.setUint32(0,0x02014b50,true);
    cv.setUint16(4,20,true);
    cv.setUint16(6,20,true);
    cv.setUint16(8,0,true);
    cv.setUint16(10,0,true);
    cv.setUint32(16,0,true);
    cv.setUint32(20,data.length,true);
    cv.setUint32(24,data.length,true);
    cv.setUint16(28,fileName.length,true);
    cv.setUint16(30,0,true);
    cv.setUint16(32,0,true);
    cv.setUint16(34,0,true);
    cv.setUint16(36,0,true);
    cv.setUint32(38,0,true);
    cv.setUint32(42,offset,true);
    central.set(fileName,46);
    centrals.push(central);
    offset+=local.length;
  }
  const centralOffset=offset;
  const centralSize=centrals.reduce((sum,item)=>sum+item.length,0);
  const end=new Uint8Array(22);
  const ev=new DataView(end.buffer);
  ev.setUint32(0,0x06054b50,true);
  ev.setUint16(4,0,true); ev.setUint16(6,0,true);
  ev.setUint16(8,centrals.length,true); ev.setUint16(10,centrals.length,true);
  ev.setUint32(12,centralSize,true); ev.setUint32(16,centralOffset,true); ev.setUint16(20,0,true);
  const total=locals.reduce((sum,item)=>sum+item.length,0)+centralSize+end.length;
  const out=new Uint8Array(total); let cursor=0;
  for(const item of locals){out.set(item,cursor);cursor+=item.length;}
  for(const item of centrals){out.set(item,cursor);cursor+=item.length;}
  out.set(end,cursor);
  return out;
}
