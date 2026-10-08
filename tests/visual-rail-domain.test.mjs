import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertVisualRailCapacity,
  buildVisualRailSnapshot,
  createVisualRail,
  createVisualRailBoard,
  createVisualRailPlacement,
  previewVisualRailArrangement,
  relocateVisualRailPlacement,
  reviseVisualRailBoard,
} from '../src/modules/visual-rail/public.mjs';

const at='2026-10-08T14:00:00.000Z';
const board=createVisualRailBoard({
  id:'board-1',ownerOrganisationId:'brand-1',mode:'showroom',
  source:{type:'showroom',id:'showroom-1',version:3,contentHash:null},
  title:'AW27 Showroom',createdBy:'sales-1',createdAt:at,
});
const rail=createVisualRail({id:'rail-1',board,position:1,label:'Main rail',capacityMode:'items',capacityCount:5,densityProfile:'balanced'});

function placement(id,position,colorHex,category='coat',width=8) {
  return createVisualRailPlacement({
    id,board,rail,position,productRef:{type:'catalog-sku',id:id.toUpperCase(),version:2,contentHash:null},
    sourceSnapshot:{styleVersionId:'style-v1',colorwayId:`cw-${id}`},
    visualProfile:{displayName:id,category,colorHex,colorSource:'canonical',assets:{front:`/media/${id}.jpg`}},
    estimatedWidthCm:width,createdBy:'sales-1',createdAt:at,
  });
}

test('Visual Rail mode/source boundary cannot drift',()=>{
  assert.equal(board.mode,'showroom');
  assert.throws(()=>createVisualRailBoard({
    id:'bad',ownerOrganisationId:'shop-1',mode:'buyer_composer',
    source:{type:'showroom',id:'showroom-1',version:1,contentHash:null},
    title:'Bad board',createdBy:'buyer-1',createdAt:at,
  }),(error)=>error.code==='VISUAL_RAIL_SOURCE_MODE_MISMATCH');
});

test('any unlocked garment can move to any exact valid rail position',()=>{
  const moved=relocateVisualRailPlacement(placement('p1',1,'#000000'),{railId:'rail-2',position:7});
  assert.equal(moved.railId,'rail-2');
  assert.equal(moved.position,7);
  assert.throws(()=>relocateVisualRailPlacement({...moved,locked:true},{railId:'rail-1',position:1}),(error)=>error.code==='VISUAL_RAIL_PLACEMENT_LOCKED');
});

test('palette arrange is deterministic and non-destructive',()=>{
  const input=[placement('red',1,'#FF0000'),placement('green',2,'#00FF00'),placement('blue',3,'#0000FF')];
  const preview=previewVisualRailArrangement(input,'palette');
  assert.deepEqual([...preview.placementIds],['red','green','blue']);
  assert.deepEqual(input.map((item)=>item.position),[1,2,3]);
  assert.deepEqual(preview.provenance.color.map((item)=>item.source),['canonical','canonical','canonical']);
});

test('physical capacity requires width estimates and rejects overflow before save',()=>{
  const physical=createVisualRail({id:'rail-cm',board,position:2,label:'2m rail',capacityMode:'physical_length',physicalLengthCm:20,densityProfile:'balanced'});
  assert.deepEqual(JSON.parse(JSON.stringify(assertVisualRailCapacity(physical,[placement('a',1,'#111111','coat',8),placement('b',2,'#222222','coat',9)]))),{
    mode:'physical_length',usedCm:17,capacityCm:20,remainingCm:3,
  });
  assert.throws(()=>assertVisualRailCapacity(physical,[placement('a2',1,'#111111','coat',12),placement('b2',2,'#222222','coat',12)]),
    (error)=>error.code==='VISUAL_RAIL_CAPACITY_EXCEEDED');
});

test('published snapshot freezes ordered composition and content hash',()=>{
  const published=reviseVisualRailBoard(board,{updatedBy:'sales-1',updatedAt:'2026-10-08T14:05:00.000Z',status:'published'});
  const placements=[placement('p2',2,'#FFFFFF'),placement('p1',1,'#000000')];
  const snapshot=buildVisualRailSnapshot({
    id:'snapshot-1',board:published,rails:[rail],placements,commercialMetrics:{pieces:2},
    publishedBy:'sales-1',publishedAt:'2026-10-08T14:05:00.000Z',
  });
  assert.equal(snapshot.boardVersion,2);
  assert.deepEqual(snapshot.snapshot.placements.map((item)=>item.id),['p1','p2']);
  assert.match(snapshot.contentHash,/^[0-9a-f]{64}$/);
});
