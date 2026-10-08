import { invariant } from '../core/errors.mjs';
import { assertBodyContract, assertQueryContract, bodyContract } from './request-contract.mjs';
import { decodePathParameter } from './transport-contract.mjs';

const CREATE_BOARD_BODY=bodyContract(['mode','sourceType','sourceId','title']);
const ADD_RAIL_BODY=bodyContract(['expectedVersion','label','capacityMode','capacityCount','physicalLengthCm','densityProfile']);
const UPDATE_RAIL_BODY=bodyContract(['expectedVersion','label','capacityMode','capacityCount','physicalLengthCm','densityProfile']);
const ADD_PLACEMENT_BODY=bodyContract(['expectedVersion','railId','productRefType','productRefId','position','estimatedWidthCm']);
const MOVE_PLACEMENT_BODY=bodyContract(['expectedVersion','toRailId','toPosition']);
const REMOVE_PLACEMENT_BODY=bodyContract(['expectedVersion']);
const ARRANGE_BODY=bodyContract(['expectedVersion','strategy']);
const PUBLISH_BODY=bodyContract(['expectedVersion','commercialMetrics']);

/** @param {{ visualRails?: any }} [options] */
export function createVisualRailRoutes({ visualRails } = {}) {
  const service=visualRails??unavailable();
  return Object.freeze([
    mutate('POST',/^\/v2\/visual-rails$/,CREATE_BOARD_BODY,(context)=>
      service.createBoard(context.commandId,context.actorId,context.body)),
    read('GET',/^\/v2\/visual-rails\/([^/]+)$/,(context)=>
      service.getForActor(context.actorId,decodePathParameter(context.params?.[0]))),
    read('GET',/^\/v2\/visual-rail-sources\/([^/]+)\/([^/]+)\/boards$/,(context)=>{
      const sourceType=decodePathParameter(context.params?.[0]);
      const sourceId=decodePathParameter(context.params?.[1]);
      assertSourceType(sourceType);
      return service.listForSource(context.actorId,sourceType,sourceId);
    }),
    mutate('POST',/^\/v2\/visual-rails\/([^/]+)\/rails$/,ADD_RAIL_BODY,(context)=>
      service.addRail(context.commandId,context.actorId,decodePathParameter(context.params?.[0]),context.body)),
    mutate('PATCH',/^\/v2\/visual-rails\/([^/]+)\/rails\/([^/]+)$/,UPDATE_RAIL_BODY,(context)=>
      service.updateRail(context.commandId,context.actorId,decodePathParameter(context.params?.[0]),decodePathParameter(context.params?.[1]),context.body)),
    mutate('POST',/^\/v2\/visual-rails\/([^/]+)\/placements$/,ADD_PLACEMENT_BODY,(context)=>
      service.addPlacement(context.commandId,context.actorId,decodePathParameter(context.params?.[0]),context.body)),
    mutate('POST',/^\/v2\/visual-rails\/([^/]+)\/placements\/([^/]+)\/move$/,MOVE_PLACEMENT_BODY,(context)=>
      service.movePlacement(context.commandId,context.actorId,decodePathParameter(context.params?.[0]),decodePathParameter(context.params?.[1]),context.body)),
    mutate('POST',/^\/v2\/visual-rails\/([^/]+)\/placements\/([^/]+)\/remove$/,REMOVE_PLACEMENT_BODY,(context)=>
      service.removePlacement(context.commandId,context.actorId,decodePathParameter(context.params?.[0]),decodePathParameter(context.params?.[1]),context.body)),
    Object.freeze({
      method:'GET',
      pattern:/^\/v2\/visual-rails\/([^/]+)\/rails\/([^/]+)\/arrangement-preview$/,
      mutation:false,
      execute(context) {
        assertQueryContract(context.query??{},['strategy']);
        invariant(typeof context.query?.strategy==='string'&&context.query.strategy,'HTTP_QUERY_FIELD_INVALID','strategy query is required');
        return service.previewArrangement(
          context.actorId,
          decodePathParameter(context.params?.[0]),
          decodePathParameter(context.params?.[1]),
          context.query.strategy,
        );
      },
    }),
    mutate('POST',/^\/v2\/visual-rails\/([^/]+)\/rails\/([^/]+)\/arrange$/,ARRANGE_BODY,(context)=>
      service.applyArrangement(context.commandId,context.actorId,decodePathParameter(context.params?.[0]),decodePathParameter(context.params?.[1]),context.body)),
    mutate('POST',/^\/v2\/visual-rails\/([^/]+)\/publish$/,PUBLISH_BODY,(context)=>
      service.publish(context.commandId,context.actorId,decodePathParameter(context.params?.[0]),context.body)),
  ]);
}

function mutate(method,pattern,contract,execute){
  return Object.freeze({method,pattern,mutation:true,execute(context){
    assertQueryContract(context.query??{},[]);
    assertBodyContract(context.body,contract);
    if(context.body?.expectedVersion!==undefined) requireVersion(context.body.expectedVersion);
    return execute(context);
  }});
}
function read(method,pattern,execute){
  return Object.freeze({method,pattern,mutation:false,execute(context){assertQueryContract(context.query??{},[]);return execute(context);}});
}
function requireVersion(value){invariant(Number.isSafeInteger(value)&&value>0,'HTTP_BODY_FIELD_INVALID','expectedVersion must be a positive integer',{field:'expectedVersion'});}
function assertSourceType(value){invariant(['showroom','buyer-catalog-version'].includes(value),'HTTP_PATH_PARAMETER_INVALID','Visual Rail source type is invalid',{field:'sourceType'});}
function unavailable(){
  const fail=()=>invariant(false,'VISUAL_RAIL_SERVICE_REQUIRED','Visual Rail service is required');
  return Object.freeze({createBoard:fail,getForActor:fail,listForSource:fail,addRail:fail,updateRail:fail,addPlacement:fail,movePlacement:fail,removePlacement:fail,previewArrangement:fail,applyArrangement:fail,publish:fail});
}
