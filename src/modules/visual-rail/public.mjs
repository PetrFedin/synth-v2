import { createHash } from 'node:crypto';
import { invariant } from '../../core/errors.mjs';
import { canonicalJson } from '../../core/fingerprints.mjs';

export const VISUAL_RAIL_MODES = Object.freeze(['showroom','buyer_composer']);
export const VISUAL_RAIL_SOURCE_TYPES = Object.freeze(['showroom','buyer-catalog-version']);
export const VISUAL_RAIL_STATUSES = Object.freeze(['draft','shared','published','archived']);
export const VISUAL_RAIL_CAPACITY_MODES = Object.freeze(['items','physical_length']);
export const VISUAL_RAIL_DENSITIES = Object.freeze(['airy','balanced','dense']);
export const VISUAL_RAIL_ARRANGEMENTS = Object.freeze(['palette','light-dark','dark-light','category','manual']);

const ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/;
const HEX=/^#[0-9A-Fa-f]{6}$/;
const HASH=/^[0-9a-f]{64}$/;

export function createVisualRailBoard({id,ownerOrganisationId,mode,source,title,createdBy,createdAt}) {
  requiredId(id,'VISUAL_RAIL_BOARD_ID_INVALID');
  requiredId(ownerOrganisationId,'VISUAL_RAIL_OWNER_INVALID');
  invariant(VISUAL_RAIL_MODES.includes(mode),'VISUAL_RAIL_MODE_INVALID','Visual Rail mode is invalid',{mode});
  const normalizedSource=normalizeSource(source);
  invariant(
    (mode==='showroom' && normalizedSource.type==='showroom')
    || (mode==='buyer_composer' && normalizedSource.type==='buyer-catalog-version'),
    'VISUAL_RAIL_SOURCE_MODE_MISMATCH','Visual Rail source is not valid for this mode',{mode,sourceType:normalizedSource.type},
  );
  const at=timestamp(createdAt,'VISUAL_RAIL_TIME_INVALID');
  const value={
    id,ownerOrganisationId,mode,source:normalizedSource,
    title:text(title,2,200,'VISUAL_RAIL_TITLE_INVALID'),
    status:'draft',version:1,createdBy:actor(createdBy),createdAt:at,updatedBy:actor(createdBy),updatedAt:at,
  };
  return freeze(value);
}

export function createVisualRail({id,board,position,label,capacityMode='items',capacityCount=20,physicalLengthCm=null,densityProfile='balanced'}) {
  requiredId(id,'VISUAL_RAIL_ID_INVALID');
  invariant(board?.id,'VISUAL_RAIL_BOARD_REQUIRED','Visual Rail board is required');
  integer(position,1,100,'VISUAL_RAIL_POSITION_INVALID');
  invariant(VISUAL_RAIL_CAPACITY_MODES.includes(capacityMode),'VISUAL_RAIL_CAPACITY_MODE_INVALID','Rail capacity mode is invalid');
  invariant(VISUAL_RAIL_DENSITIES.includes(densityProfile),'VISUAL_RAIL_DENSITY_INVALID','Rail density profile is invalid');
  const count=capacityMode==='items' ? integer(capacityCount,1,500,'VISUAL_RAIL_CAPACITY_INVALID') : null;
  const length=capacityMode==='physical_length' ? decimal(physicalLengthCm,20,10000,'VISUAL_RAIL_LENGTH_INVALID') : null;
  return freeze({
    id,boardId:board.id,position,label:text(label,1,120,'VISUAL_RAIL_LABEL_INVALID'),
    capacityMode,capacityCount:count,physicalLengthCm:length,densityProfile,version:1,
  });
}

export function createVisualRailPlacement({
  id,board,rail,position,productRef,sourceSnapshot,visualProfile={},lookGroupId=null,locked=false,estimatedWidthCm=null,createdBy,createdAt,
}) {
  requiredId(id,'VISUAL_RAIL_PLACEMENT_ID_INVALID');
  invariant(board?.id && rail?.id && rail.boardId===board.id,'VISUAL_RAIL_PLACEMENT_RAIL_MISMATCH','Placement rail must belong to the board');
  integer(position,1,1000,'VISUAL_RAIL_PLACEMENT_POSITION_INVALID');
  const ref=normalizeProductRef(productRef);
  plainObject(sourceSnapshot,'VISUAL_RAIL_SOURCE_SNAPSHOT_INVALID');
  const visual=normalizeVisualProfile(visualProfile);
  const width=estimatedWidthCm===null||estimatedWidthCm===undefined ? null : decimal(estimatedWidthCm,0.5,200,'VISUAL_RAIL_WIDTH_INVALID');
  return freeze({
    id,boardId:board.id,railId:rail.id,position,productRef:ref,
    styleVersionId:nullableId(sourceSnapshot.styleVersionId ?? visual.styleVersionId),
    colorwayId:nullableId(sourceSnapshot.colorwayId ?? visual.colorwayId),
    lookGroupId:nullableId(lookGroupId),locked:Boolean(locked),estimatedWidthCm:width,
    sourceSnapshot:clone(sourceSnapshot),visualProfile:visual,
    createdBy:actor(createdBy),createdAt:timestamp(createdAt,'VISUAL_RAIL_TIME_INVALID'),
  });
}

export function reviseVisualRailBoard(board,{updatedBy,updatedAt,status='draft'}={}) {
  invariant(board?.id,'VISUAL_RAIL_BOARD_REQUIRED','Visual Rail board is required');
  invariant(board.status!=='archived','VISUAL_RAIL_BOARD_ARCHIVED','Archived Visual Rail board cannot change');
  invariant(VISUAL_RAIL_STATUSES.includes(status),'VISUAL_RAIL_STATUS_INVALID','Visual Rail status is invalid',{status});
  return freeze({
    ...board,
    status,
    version:board.version+1,
    updatedBy:actor(updatedBy),
    updatedAt:timestamp(updatedAt,'VISUAL_RAIL_TIME_INVALID'),
  });
}

export function relocateVisualRailPlacement(placement,{railId,position}={}) {
  invariant(placement?.id,'VISUAL_RAIL_PLACEMENT_REQUIRED','Visual Rail placement is required');
  invariant(!placement.locked,'VISUAL_RAIL_PLACEMENT_LOCKED','Locked garment cannot be moved',{placementId:placement.id});
  requiredId(railId,'VISUAL_RAIL_ID_INVALID');
  integer(position,1,1000,'VISUAL_RAIL_PLACEMENT_POSITION_INVALID');
  return freeze({...placement,railId,position});
}

export function assertVisualRailCapacity(rail,placements) {
  invariant(rail?.id,'VISUAL_RAIL_REQUIRED','Visual Rail is required');
  invariant(Array.isArray(placements),'VISUAL_RAIL_PLACEMENTS_INVALID','Placements must be an array');
  if(rail.capacityMode==='items') {
    invariant(placements.length<=rail.capacityCount,'VISUAL_RAIL_CAPACITY_EXCEEDED','Rail item capacity exceeded',{
      railId:rail.id,capacity:rail.capacityCount,used:placements.length,
    });
    return freeze({mode:'items',used:placements.length,capacity:rail.capacityCount,remaining:rail.capacityCount-placements.length});
  }
  const widths=placements.map((item)=>{
    invariant(Number.isFinite(item.estimatedWidthCm),'VISUAL_RAIL_WIDTH_REQUIRED','Physical rail requires garment width estimates',{placementId:item.id});
    return item.estimatedWidthCm;
  });
  const used=widths.reduce((sum,value)=>sum+value,0);
  invariant(used<=rail.physicalLengthCm+1e-9,'VISUAL_RAIL_CAPACITY_EXCEEDED','Physical rail length exceeded',{
    railId:rail.id,capacityCm:rail.physicalLengthCm,usedCm:used,
  });
  return freeze({mode:'physical_length',usedCm:used,capacityCm:rail.physicalLengthCm,remainingCm:Math.max(0,rail.physicalLengthCm-used)});
}

export function previewVisualRailArrangement(placements,strategy) {
  invariant(Array.isArray(placements),'VISUAL_RAIL_PLACEMENTS_INVALID','Placements must be an array');
  invariant(VISUAL_RAIL_ARRANGEMENTS.includes(strategy) && strategy!=='manual','VISUAL_RAIL_ARRANGEMENT_INVALID','Arrangement strategy is invalid',{strategy});
  const decorated=placements.map((item,index)=>({item,index,key:arrangementKey(item,strategy)}));
  decorated.sort((a,b)=>compareKeys(a.key,b.key)||a.index-b.index);
  return freeze({
    strategy,
    placementIds:Object.freeze(decorated.map(({item})=>item.id)),
    provenance:Object.freeze({
      color:Object.freeze(decorated.map(({item})=>Object.freeze({
        placementId:item.id,
        source:item.visualProfile?.colorSource ?? null,
        hex:item.visualProfile?.colorHex ?? null,
      }))),
    }),
  });
}

export function buildVisualRailSnapshot({id,board,rails,placements,commercialMetrics={},publishedBy,publishedAt}) {
  requiredId(id,'VISUAL_RAIL_SNAPSHOT_ID_INVALID');
  invariant(board?.id,'VISUAL_RAIL_BOARD_REQUIRED','Visual Rail board is required');
  const orderedRails=[...rails].sort((a,b)=>a.position-b.position);
  const orderedPlacements=[...placements].sort((a,b)=>
    railPosition(orderedRails,a.railId)-railPosition(orderedRails,b.railId) || a.position-b.position);
  const snapshot=freeze({
    board:clone(board),
    rails:Object.freeze(orderedRails.map(clone)),
    placements:Object.freeze(orderedPlacements.map(clone)),
  });
  const sourceLineage=freeze({
    type:board.source.type,id:board.source.id,
    version:board.source.version ?? null,contentHash:board.source.contentHash ?? null,
  });
  const at=timestamp(publishedAt,'VISUAL_RAIL_TIME_INVALID');
  return freeze({
    id,boardId:board.id,boardVersion:board.version,contentHash:sha256(snapshot),
    snapshot,sourceLineage,commercialMetrics:clone(commercialMetrics),
    publishedBy:actor(publishedBy),publishedAt:at,
  });
}

export function normalizeVisualProfile(input={}) {
  plainObject(input,'VISUAL_RAIL_VISUAL_PROFILE_INVALID');
  const assets=plainObjectValue(input.assets ?? {},'VISUAL_RAIL_ASSETS_INVALID');
  const colorHex=input.colorHex===null||input.colorHex===undefined||input.colorHex==='' ? null : String(input.colorHex);
  invariant(colorHex===null||HEX.test(colorHex),'VISUAL_RAIL_COLOR_HEX_INVALID','Rail colour must be a six-digit HEX value');
  const colorSource=input.colorSource ?? null;
  invariant(colorSource===null||['canonical','asset-derived','manual'].includes(colorSource),'VISUAL_RAIL_COLOR_SOURCE_INVALID','Rail colour provenance is invalid');
  if(colorHex!==null) invariant(colorSource!==null,'VISUAL_RAIL_COLOR_SOURCE_REQUIRED','Colour provenance is required when a visual colour is stored');
  return freeze({
    displayName:optionalText(input.displayName,200),
    category:optionalText(input.category,120),
    colorName:optionalText(input.colorName,120),
    colorHex,
    colorSource,
    styleVersionId:nullableId(input.styleVersionId),
    colorwayId:nullableId(input.colorwayId),
    assets:freeze({
      front:optionalUri(assets.front),back:optionalUri(assets.back),side:optionalUri(assets.side),
      detail:optionalUri(assets.detail),video:optionalUri(assets.video),spin:optionalUri(assets.spin),model3d:optionalUri(assets.model3d),
    }),
    hangerAnchorX:ratio(input.hangerAnchorX,0.5),
    hangerAnchorY:ratio(input.hangerAnchorY,0.04),
  });
}

function arrangementKey(item,strategy) {
  if(strategy==='category') return [String(item.visualProfile?.category ?? '\uffff').toLocaleLowerCase(),item.position];
  const hex=item.visualProfile?.colorHex;
  if(!hex) return [1,0,0,0,item.position];
  const {h,s,l}=hexToHsl(hex);
  if(strategy==='palette') return [0,h,s,l,item.position];
  if(strategy==='light-dark') return [0,-l,h,s,item.position];
  if(strategy==='dark-light') return [0,l,h,s,item.position];
  return [0,item.position];
}
function compareKeys(a,b){for(let i=0;i<Math.max(a.length,b.length);i++){if(a[i]<b[i])return-1;if(a[i]>b[i])return 1;}return 0;}
function hexToHsl(hex){
  const n=parseInt(hex.slice(1),16), r=((n>>16)&255)/255, g=((n>>8)&255)/255, b=(n&255)/255;
  const max=Math.max(r,g,b),min=Math.min(r,g,b),l=(max+min)/2,d=max-min;
  if(d===0)return{h:0,s:0,l};
  const s=d/(1-Math.abs(2*l-1));
  let h=max===r?((g-b)/d)%6:max===g?(b-r)/d+2:(r-g)/d+4;
  h=Math.round(h*60);if(h<0)h+=360;return{h,s,l};
}
function railPosition(rails,id){const index=rails.findIndex((rail)=>rail.id===id);return index<0?Number.MAX_SAFE_INTEGER:index;}
function normalizeSource(source){
  plainObject(source,'VISUAL_RAIL_SOURCE_INVALID');
  invariant(VISUAL_RAIL_SOURCE_TYPES.includes(source.type),'VISUAL_RAIL_SOURCE_TYPE_INVALID','Visual Rail source type is invalid',{type:source.type});
  requiredId(source.id,'VISUAL_RAIL_SOURCE_ID_INVALID');
  const version=source.version===null||source.version===undefined?null:integer(source.version,1,2147483647,'VISUAL_RAIL_SOURCE_VERSION_INVALID');
  const contentHash=source.contentHash??null;
  invariant(contentHash===null||HASH.test(contentHash),'VISUAL_RAIL_SOURCE_HASH_INVALID','Visual Rail source content hash is invalid');
  return freeze({type:source.type,id:source.id,version,contentHash});
}
function normalizeProductRef(ref){
  plainObject(ref,'VISUAL_RAIL_PRODUCT_REF_INVALID');
  invariant(['catalog-sku','product-sku'].includes(ref.type),'VISUAL_RAIL_PRODUCT_REF_TYPE_INVALID','Product reference type is invalid');
  requiredId(ref.id,'VISUAL_RAIL_PRODUCT_REF_ID_INVALID');
  const version=ref.version===null||ref.version===undefined?null:integer(ref.version,1,2147483647,'VISUAL_RAIL_PRODUCT_REF_VERSION_INVALID');
  const contentHash=ref.contentHash??null;
  invariant(contentHash===null||HASH.test(contentHash),'VISUAL_RAIL_PRODUCT_REF_HASH_INVALID','Product reference content hash is invalid');
  return freeze({type:ref.type,id:ref.id,version,contentHash});
}
function sha256(value){return createHash('sha256').update(canonicalJson(value)).digest('hex');}
function requiredId(value,code){invariant(typeof value==='string'&&ID.test(value),code,'Identifier is invalid');return value;}
function nullableId(value){if(value===null||value===undefined||value==='')return null;return requiredId(String(value),'VISUAL_RAIL_REFERENCE_ID_INVALID');}
function actor(value){return requiredId(String(value??''),'VISUAL_RAIL_ACTOR_INVALID');}
function text(value,min,max,code){const v=typeof value==='string'?value.trim():'';invariant(v.length>=min&&v.length<=max,code,'Text is outside allowed bounds');return v;}
function optionalText(value,max){if(value===null||value===undefined||value==='')return null;return text(String(value),1,max,'VISUAL_RAIL_TEXT_INVALID');}
function integer(value,min,max,code){invariant(Number.isSafeInteger(value)&&value>=min&&value<=max,code,'Integer is outside allowed bounds');return value;}
function decimal(value,min,max,code){const n=Number(value);invariant(Number.isFinite(n)&&n>=min&&n<=max,code,'Number is outside allowed bounds');return n;}
function ratio(value,fallback){if(value===null||value===undefined)return fallback;const n=Number(value);invariant(Number.isFinite(n)&&n>=0&&n<=1,'VISUAL_RAIL_ANCHOR_INVALID','Garment anchor must be from 0 to 1');return n;}
function timestamp(value,code){const t=new Date(value);invariant(Number.isFinite(t.getTime()),code,'Timestamp is invalid');return t.toISOString();}
function optionalUri(value){if(value===null||value===undefined||value==='')return null;const v=String(value).trim();invariant(v.length<=2000&&/^(https?:|\/)/.test(v),'VISUAL_RAIL_ASSET_URI_INVALID','Asset URI is invalid');return v;}
function plainObject(value,code){invariant(value&&typeof value==='object'&&!Array.isArray(value),code,'Object is required');return value;}
function plainObjectValue(value,code){plainObject(value,code);return value;}
function clone(value){return freeze(structuredClone(value));}
function freeze(value){if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.freeze(value);for(const v of Object.values(value))freeze(v);}return value;}
