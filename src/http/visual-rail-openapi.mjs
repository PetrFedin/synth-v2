import {
  VISUAL_RAIL_ARRANGEMENTS,
  VISUAL_RAIL_CAPACITY_MODES,
  VISUAL_RAIL_DENSITIES,
  VISUAL_RAIL_MODES,
  VISUAL_RAIL_SOURCE_TYPES,
  VISUAL_RAIL_STATUSES,
} from '../modules/visual-rail/public.mjs';

const identifier={type:'string',minLength:1,maxLength:240,pattern:'^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$'};
const idempotency={name:'Idempotency-Key',in:'header',required:true,schema:{type:'string',minLength:1,maxLength:128}};
const errorResponse={description:'Domain or transport error',content:{'application/json':{schema:{$ref:'#/components/schemas/Error'}}}};

export function withVisualRailOpenApi(base) {
  const specification=structuredClone(base);
  Object.assign(specification.components.schemas,schemas());
  Object.assign(specification.paths,paths());
  return deepFreeze(specification);
}

function schemas(){
  return {
    VisualRailBoard:{
      type:'object',additionalProperties:true,
      required:['id','ownerOrganisationId','mode','source','title','status','version','createdBy','createdAt','updatedBy','updatedAt'],
      properties:{
        id:identifier,ownerOrganisationId:identifier,mode:{type:'string',enum:VISUAL_RAIL_MODES},
        source:{type:'object',additionalProperties:false,required:['type','id','version','contentHash'],properties:{
          type:{type:'string',enum:VISUAL_RAIL_SOURCE_TYPES},id:identifier,
          version:{oneOf:[{type:'integer',minimum:1},{type:'null'}]},
          contentHash:{oneOf:[{type:'string',pattern:'^[0-9a-f]{64}$'},{type:'null'}]},
        }},
        title:{type:'string',minLength:2,maxLength:200},status:{type:'string',enum:VISUAL_RAIL_STATUSES},version:{type:'integer',minimum:1},
        createdBy:identifier,createdAt:{type:'string',format:'date-time'},updatedBy:identifier,updatedAt:{type:'string',format:'date-time'},
      },
    },
    VisualRail:{
      type:'object',additionalProperties:true,required:['id','boardId','position','label','capacityMode','densityProfile','version'],
      properties:{
        id:identifier,boardId:identifier,position:{type:'integer',minimum:1,maximum:100},label:{type:'string',minLength:1,maxLength:120},
        capacityMode:{type:'string',enum:VISUAL_RAIL_CAPACITY_MODES},
        capacityCount:{oneOf:[{type:'integer',minimum:1,maximum:500},{type:'null'}]},
        physicalLengthCm:{oneOf:[{type:'number',minimum:20,maximum:10000},{type:'null'}]},
        densityProfile:{type:'string',enum:VISUAL_RAIL_DENSITIES},version:{type:'integer',minimum:1},
      },
    },
    VisualRailPlacement:{
      type:'object',additionalProperties:true,
      required:['id','boardId','railId','position','productRef','locked','sourceSnapshot','visualProfile','createdBy','createdAt'],
      properties:{
        id:identifier,boardId:identifier,railId:identifier,position:{type:'integer',minimum:1,maximum:1000},
        productRef:{type:'object',additionalProperties:false,required:['type','id','version','contentHash'],properties:{
          type:{type:'string',enum:['catalog-sku','product-sku']},id:identifier,
          version:{oneOf:[{type:'integer',minimum:1},{type:'null'}]},contentHash:{oneOf:[{type:'string',pattern:'^[0-9a-f]{64}$'},{type:'null'}]},
        }},
        styleVersionId:{oneOf:[identifier,{type:'null'}]},colorwayId:{oneOf:[identifier,{type:'null'}]},
        lookGroupId:{oneOf:[identifier,{type:'null'}]},locked:{type:'boolean'},
        estimatedWidthCm:{oneOf:[{type:'number',minimum:0.5,maximum:200},{type:'null'}]},
        sourceSnapshot:{type:'object'},visualProfile:{type:'object'},createdBy:identifier,createdAt:{type:'string',format:'date-time'},
      },
    },
    VisualRailSnapshot:{
      type:'object',additionalProperties:true,
      required:['id','boardId','boardVersion','contentHash','snapshot','sourceLineage','commercialMetrics','publishedBy','publishedAt'],
      properties:{
        id:identifier,boardId:identifier,boardVersion:{type:'integer',minimum:1},contentHash:{type:'string',pattern:'^[0-9a-f]{64}$'},
        snapshot:{type:'object'},sourceLineage:{type:'object'},commercialMetrics:{type:'object'},
        publishedBy:identifier,publishedAt:{type:'string',format:'date-time'},
      },
    },
    VisualRailWorkspace:{
      type:'object',additionalProperties:false,required:['board','rails','placements','capacities'],
      properties:{
        board:{$ref:'#/components/schemas/VisualRailBoard'},
        rails:{type:'array',items:{$ref:'#/components/schemas/VisualRail'}},
        placements:{type:'array',items:{$ref:'#/components/schemas/VisualRailPlacement'}},
        capacities:{type:'object',additionalProperties:{type:'object'}},
        latestSnapshot:{oneOf:[{$ref:'#/components/schemas/VisualRailSnapshot'},{type:'null'}]},
      },
    },
  };
}

function paths(){
  const boardId={name:'boardId',in:'path',required:true,schema:identifier};
  const railId={name:'railId',in:'path',required:true,schema:identifier};
  const placementId={name:'placementId',in:'path',required:true,schema:identifier};
  const sourceType={name:'sourceType',in:'path',required:true,schema:{type:'string',enum:VISUAL_RAIL_SOURCE_TYPES}};
  const sourceId={name:'sourceId',in:'path',required:true,schema:identifier};
  const ok=(schema)=>({description:'Success',content:{'application/json':{schema}}});
  const mutation=(operationId,summary,requestSchema,responseSchema,parameters=[])=>({
    post:{operationId,summary,security:[{bearerAuth:[]}],parameters:[...parameters,idempotency],
      requestBody:{required:true,content:{'application/json':{schema:requestSchema}}},
      responses:{200:ok(responseSchema),400:errorResponse,401:errorResponse,403:errorResponse,404:errorResponse,409:errorResponse,422:errorResponse}},
  });
  return {
    '/visual-rails':mutation('createVisualRailBoard','Create a Visual Rail board',{
      type:'object',additionalProperties:false,required:['mode','sourceType','sourceId','title'],
      properties:{mode:{type:'string',enum:VISUAL_RAIL_MODES},sourceType:{type:'string',enum:VISUAL_RAIL_SOURCE_TYPES},sourceId:identifier,title:{type:'string',minLength:2,maxLength:200}},
    },{$ref:'#/components/schemas/VisualRailBoard'}),
    '/visual-rails/{boardId}':{get:{operationId:'getVisualRailBoard',summary:'Read Visual Rail workspace',security:[{bearerAuth:[]}],parameters:[boardId],responses:{200:ok({$ref:'#/components/schemas/VisualRailWorkspace'}),401:errorResponse,403:errorResponse,404:errorResponse}}},
    '/visual-rail-sources/{sourceType}/{sourceId}/boards':{get:{operationId:'listVisualRailBoardsForSource',summary:'List Visual Rail boards for a source',security:[{bearerAuth:[]}],parameters:[sourceType,sourceId],responses:{200:ok({type:'array',items:{$ref:'#/components/schemas/VisualRailBoard'}}),401:errorResponse,403:errorResponse,404:errorResponse}}},
    '/visual-rails/{boardId}/rails':mutation('addVisualRail','Add a rail to a board',{type:'object',additionalProperties:true}, {type:'object'},[boardId]),
    '/visual-rails/{boardId}/rails/{railId}':{patch:{operationId:'updateVisualRail',summary:'Update rail capacity and presentation settings',security:[{bearerAuth:[]}],parameters:[boardId,railId,idempotency],requestBody:{required:true,content:{'application/json':{schema:{type:'object',additionalProperties:true}}}},responses:{200:ok({type:'object'}),400:errorResponse,401:errorResponse,403:errorResponse,404:errorResponse,409:errorResponse}}},
    '/visual-rails/{boardId}/placements':mutation('addVisualRailPlacement','Place a garment on a rail',{type:'object',additionalProperties:true},{type:'object'},[boardId]),
    '/visual-rails/{boardId}/placements/{placementId}/move':mutation('moveVisualRailPlacement','Move a garment to any rail/position',{type:'object',additionalProperties:true},{type:'object'},[boardId,placementId]),
    '/visual-rails/{boardId}/placements/{placementId}/remove':mutation('removeVisualRailPlacement','Remove a garment from the board',{type:'object',additionalProperties:false,required:['expectedVersion'],properties:{expectedVersion:{type:'integer',minimum:1}}},{type:'object'},[boardId,placementId]),
    '/visual-rails/{boardId}/rails/{railId}/arrangement-preview':{get:{operationId:'previewVisualRailArrangement',summary:'Preview a non-destructive rail arrangement',security:[{bearerAuth:[]}],parameters:[boardId,railId,{name:'strategy',in:'query',required:true,schema:{type:'string',enum:VISUAL_RAIL_ARRANGEMENTS.filter((item)=>item!=='manual')}}],responses:{200:ok({type:'object'}),400:errorResponse,401:errorResponse,403:errorResponse,404:errorResponse}}},
    '/visual-rails/{boardId}/rails/{railId}/arrange':mutation('applyVisualRailArrangement','Apply an arrangement proposal after human confirmation',{type:'object',additionalProperties:false,required:['expectedVersion','strategy'],properties:{expectedVersion:{type:'integer',minimum:1},strategy:{type:'string',enum:VISUAL_RAIL_ARRANGEMENTS.filter((item)=>item!=='manual')}}},{type:'object'},[boardId,railId]),
    '/visual-rails/{boardId}/publish':mutation('publishVisualRailBoard','Publish an immutable Visual Rail snapshot',{type:'object',additionalProperties:true},{type:'object'},[boardId]),
  };
}
function deepFreeze(value){if(!value||typeof value!=='object'||Object.isFrozen(value))return value;Object.freeze(value);for(const nested of Object.values(value))deepFreeze(nested);return value;}
