import { buildCanonicalTechPackIssueSnapshot } from '../../src/application/tech-pack-canonical-issue-snapshot.mjs';
import { bindIssuedTechPackDocumentContext } from '../../src/application/tech-pack-issued-document-context.mjs';

const mdm=(entryId,dictionaryCode,code)=>({entryId,version:3,dictionaryCode,
  snapshot:{code,translations:{ru:'Frozen RU',en:'Frozen EN'}}});

export function completeCanonicalTechPackFixture({operations=true,sketches='verified',rightsVersion=1,
  sketchContentHash='e'.repeat(64),sketchByteSize=12000,sketchMimeType='image/png'}={}) {
  const pack={id:'pack-1',techPackCode:'TP/2026/001',sku:'JACKET-01',brandId:'brand-1',
    skuVersion:2,revision:1,sourceTechPackCode:null,status:'draft',version:1,
    title:'Issued technical jacket',description:'Historical issued description',
    supplierCode:'FACTORY-01',supplierName:'Issued Factory',supplierEmail:'factory@example.test',
    constructionNotes:'Issued construction',qualityNotes:'Issued quality',
    packingNotes:'Issued packing',createdAt:'2026-10-13T00:00:00.000Z'};
  const catalog={sku:pack.sku,brandId:pack.brandId,status:'published',version:2};
  const bom={id:'bom-1',version:2,sku:pack.sku,brandId:pack.brandId,status:'published',
    currency:'EUR',materialCost:21,laborCost:20,overheadCost:5,logisticsCost:2,otherCost:1,totalCost:49,
    lines:[{lineId:'SHELL',position:1,component:'Shell',materialCode:'FAB-01',materialVersion:4,
      materialName:'Original fabric',materialType:'fabric',unit:'m',quantity:2,wastePercent:5,
      grossQuantity:2.1,materialCurrency:'USD',unitCostSnapshot:12.3456,
      exchangeRate:0.810005184,lineCost:21,placement:'Front and back',isMain:true}]};
  const chart={id:'chart-1',version:2,sku:null,brandId:pack.brandId,status:'published',
    styleVersionId:'style-v1',colorwayId:'color-1',sizeScaleVersionId:'scale-v1',
    measurementUnitEntryId:'unit-cm',measurementUnitEntryVersion:3,
    measurementUnit:mdm('unit-cm','measurement.unit','CM'),unit:'CM',baseSizeValueId:'size-m',
    sizes:[{sizeValueId:'size-s',code:'S',labelRu:'Small RU',labelEn:'Small EN',position:1},
      {sizeValueId:'size-m',code:'M',labelRu:'Medium RU',labelEn:'Medium EN',position:2}],
    points:[{pointEntryId:'point-chest',pointEntryVersion:3,
      pointRef:mdm('point-chest','measurement.point','CHEST'),pointCode:'CHEST',position:1,
      nameRu:'Chest RU',nameEn:'Chest EN',description:'Measured flat',
      toleranceMinus:0,tolerancePlus:0.5,measurements:[
        {sizeValueId:'size-m',sizeCode:'M',value:112.125},
        {sizeValueId:'size-s',sizeCode:'S',value:108.25}]}]};
  const sample={sampleCode:'PPS-01',version:1,sku:pack.sku,brandId:pack.brandId,
    supplierCode:pack.supplierCode,status:'approved',sampleType:'pre-production',round:1,
    receipt:{condition:'accepted'},decision:{notes:'Approved original fabric'}};
  const sources={productSkuId:'product-1',
    productSku:{id:'product-1',skuCode:pack.sku,brandId:pack.brandId,styleVersionId:'style-v1',
      colorwayId:'color-1',sizeValueId:'size-m',contentHash:'a'.repeat(64)},
    sizeValue:{id:'size-m',brandId:pack.brandId,sizeScaleVersionId:'scale-v1'},
    bom:{...bom,productSkuId:'product-1',payload:bom},
    chart:{...chart,payload:chart},
    sample:{...sample,productSkuId:'product-1',payload:sample}};
  const snapshot=buildCanonicalTechPackIssueSnapshot({techPack:pack,catalogSku:catalog,sources});
  const issued={...pack,status:'issued',version:2,issuedAt:'2026-10-14T00:00:00.000Z',
    issuedBy:'actor-1',dependencySnapshot:snapshot};
  const documentSources={
    product:{
      styleVersion:{id:'style-v1',brandId:pack.brandId,styleId:'style-1',versionNo:1,
        titleRu:'Куртка',titleEn:'Jacket',contentHash:'b'.repeat(64)},
      colorway:{id:'color-1',brandId:pack.brandId,styleVersionId:'style-v1',code:'BLACK',
        nameRu:'Чёрный',nameEn:'Black',contentHash:'c'.repeat(64)},
      sizeValue:{id:'size-m',brandId:pack.brandId,sizeScaleVersionId:'scale-v1',
        code:'M',labelRu:'Средний',labelEn:'Medium'},
      sizeScaleVersion:{id:'scale-v1',brandId:pack.brandId,sizeScaleId:'scale-1',
        versionNo:1,contentHash:'d'.repeat(64)}},
    supplier:{id:'supplier-1',supplierCode:pack.supplierCode,brandId:pack.brandId,version:3,status:'qualified'},
    operations:operations?[{id:'operation-1',techPackCode:pack.techPackCode,brandId:pack.brandId,
      sequence:1,operationCode:'ASSEMBLE',nameRu:'Сборка',nameEn:'Assembly',
      equipment:'Machine A',machineClass:'manual',standardMinutes:3.25,notes:'Issued operation',
      createdAt:'2026-10-13T01:00:00.000Z',createdBy:'technologist-1'}]:[],
    sketches:[],
  };
  if(sketches !== 'missing') {
    documentSources.sketches=[{
      id:'media-1',brandId:pack.brandId,styleVersionId:'style-v1',colorwayId:'color-1',
      mediaType:'image',mediaRole:'design_sketch',uri:'s3://alias/front.png',sortOrder:0,
      contentHash:sketchContentHash,payload:{viewLabel:'Front / Перед'},
      createdAt:'2026-10-13T01:00:00.000Z',createdBy:'designer-1',
      retainedAsset:sketches === 'verified'?{mediaId:'media-1',contentHash:sketchContentHash,
        storageKey:'sha256/'+sketchContentHash.slice(0,2)+'/front.png',storageVersion:'v1',mimeType:sketchMimeType,byteSize:sketchByteSize,
        retainedAt:'2026-10-13T02:00:00.000Z',retainedBy:'asset-authority'}:null,
      rights:sketches === 'verified'?{id:'rights-'+rightsVersion,mediaId:'media-1',version:rightsVersion,status:'cleared',
        basis:'brand-owned',evidenceRef:'contract://1',approvedAt:'2026-10-13T03:00:00.000Z',
        approvedBy:'rights-officer',validUntil:null}:null,
    }];
  }
  return bindIssuedTechPackDocumentContext(issued,sources,documentSources);
}
