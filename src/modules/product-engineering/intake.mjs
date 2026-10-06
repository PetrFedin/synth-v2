import { createHash } from 'node:crypto';
import { invariant } from '../../core/errors.mjs';
import { canonicalJson } from '../../core/fingerprints.mjs';

export const ENGINEERING_SOURCE_KINDS = Object.freeze([
  'product_media','style_reference','document','spreadsheet','external_uri','sample','manual_observation',
]);
export const ENGINEERING_INGEST_MODES = Object.freeze(['upload','connector','canonical_asset','manual']);
export const ENGINEERING_SOURCE_STATUSES = Object.freeze(['pending','admitted','rejected','quarantined']);
export const ENGINEERING_SCAN_STATUSES = Object.freeze(['pending','clean','infected','error','not_applicable']);
export const ENGINEERING_PARSE_STATUSES = Object.freeze(['not_required','pending','queued','completed','failed']);
export const ENGINEERING_FRAGMENT_KINDS = Object.freeze([
  'document_page','sheet','cell_range','image_region','text_span','metadata','manual_note',
]);

const HASH=/^[0-9a-f]{64}$/;
const SAFE_MIME=/^[a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*$/i;

export function createEngineeringSource({
  id, brandId, styleId, kind, ingestMode, mediaType = null, originalName = null,
  sizeBytes = null, contentHash = null, storageRef = null, sourceUri = null,
  metadata = {}, createdAt, createdBy,
}) {
  required(id,'ENGINEERING_SOURCE_ID_REQUIRED');
  required(brandId,'ENGINEERING_SOURCE_BRAND_REQUIRED');
  required(styleId,'ENGINEERING_SOURCE_STYLE_REQUIRED');
  invariant(ENGINEERING_SOURCE_KINDS.includes(kind),'ENGINEERING_SOURCE_KIND_INVALID','Engineering source kind is invalid',{kind});
  invariant(ENGINEERING_INGEST_MODES.includes(ingestMode),'ENGINEERING_INGEST_MODE_INVALID','Engineering ingest mode is invalid',{ingestMode});
  if (mediaType !== null) invariant(typeof mediaType==='string'&&SAFE_MIME.test(mediaType),'ENGINEERING_SOURCE_MEDIA_TYPE_INVALID','Source media type is invalid');
  if (originalName !== null) boundedText(originalName,1,260,'ENGINEERING_SOURCE_NAME_INVALID');
  if (sizeBytes !== null) invariant(Number.isSafeInteger(sizeBytes)&&sizeBytes>=0,'ENGINEERING_SOURCE_SIZE_INVALID','Source size must be a non-negative integer');
  if (contentHash !== null) sha(contentHash,'ENGINEERING_SOURCE_HASH_INVALID');
  if (storageRef !== null) boundedText(storageRef,1,1000,'ENGINEERING_SOURCE_STORAGE_REF_INVALID');
  if (sourceUri !== null) {
    boundedText(sourceUri,1,2000,'ENGINEERING_SOURCE_URI_INVALID');
    const parsed=safeUrl(sourceUri);
    invariant(parsed.protocol==='https:','ENGINEERING_SOURCE_URI_SCHEME_INVALID','Only HTTPS source URIs are allowed');
  }
  object(metadata,'ENGINEERING_SOURCE_METADATA_INVALID','Source metadata must be an object');
  invariant(ingestMode!=='upload'||contentHash!==null,'ENGINEERING_SOURCE_UPLOAD_HASH_REQUIRED','Uploaded source requires a content hash before registration');
  invariant(ingestMode!=='upload'||storageRef!==null,'ENGINEERING_SOURCE_UPLOAD_STORAGE_REQUIRED','Uploaded source requires a durable storage reference');
  invariant(ingestMode!=='canonical_asset'||storageRef!==null,'ENGINEERING_SOURCE_CANONICAL_REF_REQUIRED','Canonical asset source requires a storage reference');
  invariant(kind!=='external_uri'||ingestMode==='connector','ENGINEERING_SOURCE_EXTERNAL_MODE_INVALID','external_uri sources must use a governed connector, not direct external fetch');
  return deepFreeze({
    id,brandId,styleId,kind,ingestMode,mediaType,originalName,sizeBytes,contentHash,storageRef,sourceUri,
    metadata:structuredClone(metadata),status:'pending',
    scanStatus:scanRequired({kind,ingestMode})?'pending':'not_applicable',
    parseStatus:parseRequired({kind,mediaType})?'pending':'not_required',
    rejectionCode:null,rejectionMessage:null,
    createdAt:time(createdAt,'ENGINEERING_SOURCE_TIME_INVALID'),createdBy:actor(createdBy),
    admittedAt:null,admittedBy:null,version:1,
  });
}

export function recordSourceScan(source,{status,scannedAt,engine=null,details={}}) {
  invariant(source?.status==='pending','ENGINEERING_SOURCE_NOT_PENDING','Only pending source can receive scan result');
  invariant(['clean','infected','error'].includes(status),'ENGINEERING_SOURCE_SCAN_STATUS_INVALID','Scan result is invalid',{status});
  object(details,'ENGINEERING_SOURCE_SCAN_DETAILS_INVALID','Scan details must be an object');
  if (engine!==null) boundedText(engine,1,160,'ENGINEERING_SOURCE_SCAN_ENGINE_INVALID');
  return deepFreeze({
    ...source,
    scanStatus:status,
    metadata:deepFreeze({...source.metadata,securityScan:{status,engine,scannedAt:time(scannedAt,'ENGINEERING_SOURCE_SCAN_TIME_INVALID'),details:structuredClone(details)}}),
    version:source.version+1,
  });
}

export function admitEngineeringSource(source,{admittedAt,admittedBy,policyVersion}) {
  invariant(source?.status==='pending','ENGINEERING_SOURCE_NOT_PENDING','Only pending source can be admitted');
  invariant(source.scanStatus==='clean'||source.scanStatus==='not_applicable','ENGINEERING_SOURCE_SCAN_REQUIRED','Source must pass security scanning before admission',{scanStatus:source.scanStatus});
  invariant(source.contentHash!==null||source.ingestMode==='manual','ENGINEERING_SOURCE_HASH_REQUIRED','Source requires immutable content hash before admission');
  boundedText(policyVersion,1,80,'ENGINEERING_SOURCE_POLICY_VERSION_INVALID');
  return deepFreeze({
    ...source,status:'admitted',admittedAt:time(admittedAt,'ENGINEERING_SOURCE_TIME_INVALID'),admittedBy:actor(admittedBy),
    metadata:deepFreeze({...source.metadata,admissionPolicyVersion:policyVersion}),version:source.version+1,
  });
}

export function rejectEngineeringSource(source,{code,message,rejectedAt,rejectedBy,quarantine=false}) {
  invariant(source?.status==='pending','ENGINEERING_SOURCE_NOT_PENDING','Only pending source can be rejected');
  boundedText(code,1,120,'ENGINEERING_SOURCE_REJECTION_CODE_INVALID');
  boundedText(message,1,2000,'ENGINEERING_SOURCE_REJECTION_MESSAGE_INVALID');
  return deepFreeze({
    ...source,status:quarantine?'quarantined':'rejected',rejectionCode:code,rejectionMessage:message,
    admittedAt:time(rejectedAt,'ENGINEERING_SOURCE_TIME_INVALID'),admittedBy:actor(rejectedBy),version:source.version+1,
  });
}

export function createEngineeringFragment({
  id,source,kind,locator,content=null,contentHash=null,createdAt,createdBy,
}) {
  invariant(source?.status==='admitted','ENGINEERING_SOURCE_NOT_ADMITTED','Fragments require an admitted source');
  required(id,'ENGINEERING_FRAGMENT_ID_REQUIRED');
  invariant(ENGINEERING_FRAGMENT_KINDS.includes(kind),'ENGINEERING_FRAGMENT_KIND_INVALID','Engineering fragment kind is invalid',{kind});
  object(locator,'ENGINEERING_FRAGMENT_LOCATOR_INVALID','Fragment locator must be an object');
  assertLocator(kind,locator);
  if (content!==null) assertJson(content,'ENGINEERING_FRAGMENT_CONTENT_INVALID');
  const derivedHash=content===null?null:digest(content);
  if (contentHash!==null) sha(contentHash,'ENGINEERING_FRAGMENT_HASH_INVALID');
  invariant(contentHash===null||derivedHash===null||contentHash===derivedHash,'ENGINEERING_FRAGMENT_HASH_MISMATCH','Fragment content hash does not match content');
  return deepFreeze({
    id,sourceId:source.id,brandId:source.brandId,styleId:source.styleId,kind,
    locator:structuredClone(locator),content:content===null?null:structuredClone(content),
    contentHash:contentHash??derivedHash,createdAt:time(createdAt,'ENGINEERING_SOURCE_TIME_INVALID'),createdBy:actor(createdBy),
  });
}

export function queueSourceParsing(source,{queuedAt,queuedBy}) {
  invariant(source?.status==='admitted','ENGINEERING_SOURCE_NOT_ADMITTED','Only admitted source can be queued for parsing');
  invariant(source.parseStatus==='pending','ENGINEERING_SOURCE_PARSE_STATE_INVALID','Source is not pending parsing');
  return deepFreeze({
    ...source,
    parseStatus:'queued',
    metadata:deepFreeze({...source.metadata,parseQueue:{queuedAt:time(queuedAt,'ENGINEERING_SOURCE_TIME_INVALID'),queuedBy:actor(queuedBy)}}),
    version:source.version+1,
  });
}

export function completeSourceParsing(source,{completedAt,parser,parserVersion,fragmentCount}) {
  invariant(source?.status==='admitted','ENGINEERING_SOURCE_NOT_ADMITTED','Only admitted source can complete parsing');
  invariant(source.parseStatus==='pending'||source.parseStatus==='queued','ENGINEERING_SOURCE_PARSE_STATE_INVALID','Source is not awaiting parsing');
  boundedText(parser,1,160,'ENGINEERING_SOURCE_PARSER_INVALID');
  boundedText(parserVersion,1,80,'ENGINEERING_SOURCE_PARSER_VERSION_INVALID');
  invariant(Number.isInteger(fragmentCount)&&fragmentCount>=0,'ENGINEERING_SOURCE_FRAGMENT_COUNT_INVALID','Fragment count must be a non-negative integer');
  return deepFreeze({
    ...source,parseStatus:'completed',
    metadata:deepFreeze({...source.metadata,parse:{parser,parserVersion,fragmentCount,completedAt:time(completedAt,'ENGINEERING_SOURCE_TIME_INVALID')}}),
    version:source.version+1,
  });
}

function scanRequired({kind,ingestMode}) { return ingestMode==='upload'||kind==='document'||kind==='spreadsheet'||kind==='sample'; }
function parseRequired({kind,mediaType}) {
  if (['document','spreadsheet'].includes(kind)) return true;
  return typeof mediaType==='string'&&(mediaType==='application/pdf'||mediaType.includes('spreadsheet')||mediaType.includes('csv'));
}
function assertLocator(kind,locator) {
  const fail=(message)=>invariant(false,'ENGINEERING_FRAGMENT_LOCATOR_INVALID',message,{kind,locator});
  if(kind==='document_page') { if(!(Number.isInteger(locator.page)&&locator.page>=1)) fail('document_page locator requires page >= 1'); }
  if(kind==='sheet') { if(!(typeof locator.sheet==='string'&&locator.sheet.trim())) fail('sheet locator requires sheet name'); }
  if(kind==='cell_range') {
    if(!(typeof locator.sheet==='string'&&locator.sheet.trim()&&typeof locator.range==='string'&&/^[A-Z]+[1-9][0-9]*:[A-Z]+[1-9][0-9]*$/.test(locator.range))) fail('cell_range locator requires sheet and A1 range');
  }
  if(kind==='image_region') {
    const r=locator.region;
    if(!(r&&['x','y','w','h'].every(k=>typeof r[k]==='number'&&Number.isFinite(r[k])&&r[k]>=0&&r[k]<=1)&&r.x+r.w<=1.000001&&r.y+r.h<=1.000001)) fail('image_region locator requires normalized x/y/w/h');
  }
  if(kind==='text_span') {
    if(!(Number.isInteger(locator.start)&&Number.isInteger(locator.end)&&locator.start>=0&&locator.end>locator.start)) fail('text_span locator requires start/end offsets');
  }
}
function digest(value){return createHash('sha256').update(canonicalJson(value)).digest('hex');}
function sha(value,code){invariant(typeof value==='string'&&HASH.test(value),code,'SHA-256 hash is invalid');return value;}
function required(value,code){invariant(typeof value==='string'&&value.trim()&&value.length<=160,code,'Identifier is required');return value;}
function actor(value){return required(value,'ENGINEERING_SOURCE_ACTOR_INVALID');}
function boundedText(value,min,max,code){invariant(typeof value==='string'&&value.trim().length>=min&&value.trim().length<=max,code,'Text length is invalid');return value.trim();}
function object(value,code,message){invariant(value&&typeof value==='object'&&!Array.isArray(value),code,message);assertJson(value,code);return value;}
function assertJson(value,code){try{canonicalJson(value);}catch{invariant(false,code,'Value must be JSON-serializable');}}
function time(value,code){invariant(typeof value==='string'&&Number.isFinite(Date.parse(value)),code,'Timestamp is invalid');return new Date(value).toISOString();}
function safeUrl(value){try{return new URL(value);}catch{invariant(false,'ENGINEERING_SOURCE_URI_INVALID','Source URI is invalid');}}
function deepFreeze(value){if(!value||typeof value!=='object'||Object.isFrozen(value))return value;Object.freeze(value);for(const nested of Object.values(value))deepFreeze(nested);return value;}
