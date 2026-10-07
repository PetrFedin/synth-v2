import { EXCEPTION_CATEGORIES, EXCEPTION_SEVERITIES, EXCEPTION_STATES, OPERATIONAL_ENTITY_TYPES } from '../modules/operational-control/public.mjs';

const SAFE_ID='^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$';
const identifier={type:'string',minLength:1,maxLength:240,pattern:SAFE_ID};
const idempotency={name:'Idempotency-Key',in:'header',required:true,schema:{type:'string',minLength:1,maxLength:128,pattern:'^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'}};
const errorResponse={description:'Domain or transport error',content:{'application/json':{schema:{$ref:'#/components/schemas/Error'}}}};

export function withOperationalExceptionOpenApi(base) {
  const specification=structuredClone(base);
  Object.assign(specification.components.schemas, schemas());
  Object.assign(specification.paths, paths());
  return deepFreeze(specification);
}

function schemas() {
  const entity={
    type:'object',additionalProperties:false,required:['type','id'],
    properties:{
      type:{type:'string',enum:OPERATIONAL_ENTITY_TYPES},id:identifier,
      version:{oneOf:[{type:'integer',minimum:1},{type:'null'}]},
      contentHash:{oneOf:[{type:'string',pattern:'^[a-f0-9]{64}$'},{type:'null'}]},
    },
  };
  return {
    OperationalSlaPolicy:{
      type:'object',additionalProperties:true,
      required:['id','version','ownerOrganisationId','name','status','responseMinutes','resolutionMinutes','escalationMinutes','applicability','createdBy','createdAt'],
      properties:{
        id:identifier,version:{type:'integer',minimum:1},ownerOrganisationId:identifier,
        name:{type:'string',minLength:2,maxLength:160},status:{type:'string',enum:['active','retired']},
        responseMinutes:{type:'integer',minimum:1},resolutionMinutes:{type:'integer',minimum:1},escalationMinutes:{type:'integer',minimum:1},
        applicability:{type:'object',additionalProperties:false,properties:{
          categories:{type:'array',uniqueItems:true,items:{type:'string',enum:EXCEPTION_CATEGORIES}},
          severities:{type:'array',uniqueItems:true,items:{type:'string',enum:EXCEPTION_SEVERITIES}},
          blockingOnly:{type:'boolean'},
        }},
        createdBy:identifier,createdAt:{type:'string',format:'date-time'},
      },
    },
    OperationalException:{
      type:'object',additionalProperties:true,
      required:['id','ownerOrganisationId','dedupeKey','entity','category','severity','blocking','ownerRole','threadId','dueAt','slaPolicyId','slaPolicyVersion','slaSnapshot','state','version','escalationCount','openedBy','openedAt'],
      properties:{
        id:identifier,ownerOrganisationId:identifier,dedupeKey:{type:'string',minLength:3,maxLength:500},
        entity,category:{type:'string',enum:EXCEPTION_CATEGORIES},severity:{type:'string',enum:EXCEPTION_SEVERITIES},
        blocking:{type:'boolean'},ownerRole:{type:'string',minLength:1,maxLength:120},ownerUserId:{oneOf:[identifier,{type:'null'}]},
        threadId:identifier,dueAt:{type:'string',format:'date-time'},calendarMilestoneId:{oneOf:[identifier,{type:'null'}]},
        slaPolicyId:identifier,slaPolicyVersion:{type:'integer',minimum:1},
        state:{type:'string',enum:EXCEPTION_STATES},version:{type:'integer',minimum:1},escalationCount:{type:'integer',minimum:0},
        acceptedRiskDecisionId:{oneOf:[identifier,{type:'null'}]},openedBy:identifier,openedAt:{type:'string',format:'date-time'},
      },
    },
    OperationalExceptionTransition:{
      type:'object',additionalProperties:true,
      required:['exceptionId','sequence','fromState','toState','fromVersion','toVersion','actorId','actorOrganisationId','occurredAt'],
      properties:{
        exceptionId:identifier,sequence:{type:'integer',minimum:1},
        fromState:{oneOf:[{type:'string',enum:EXCEPTION_STATES},{type:'null'}]},
        toState:{type:'string',enum:EXCEPTION_STATES},
        fromVersion:{oneOf:[{type:'integer',minimum:1},{type:'null'}]},toVersion:{type:'integer',minimum:1},
        actorId:identifier,actorOrganisationId:identifier,occurredAt:{type:'string',format:'date-time'},
      },
    },
  };
}

function paths() {
  const exceptionId={name:'exceptionId',in:'path',required:true,schema:identifier};
  const policyId={name:'policyId',in:'path',required:true,schema:identifier};
  const entityType={name:'entityType',in:'path',required:true,schema:{type:'string',enum:OPERATIONAL_ENTITY_TYPES}};
  const entityId={name:'entityId',in:'path',required:true,schema:identifier};
  const ok=(schema)=>({description:'Success',content:{'application/json':{schema}}});
  const mutation=(operationId,summary,requestSchema,responseSchema,parameters=[])=>({
    post:{operationId,summary,security:[{bearerAuth:[]}],parameters:[...parameters,idempotency],
      requestBody:{required:true,content:{'application/json':{schema:requestSchema}}},
      responses:{200:ok(responseSchema),400:errorResponse,401:errorResponse,403:errorResponse,409:errorResponse,422:errorResponse}},
  });
  return {
    '/operational/sla-policies': mutation('createOperationalSlaPolicy','Create an immutable SLA policy version',{
      type:'object',additionalProperties:true,
    },{$ref:'#/components/schemas/OperationalSlaPolicy'}),
    '/operational/sla-policies/{policyId}/retire': mutation('retireOperationalSlaPolicy','Append a retired SLA policy version',{type:'object',additionalProperties:false,required:['actingOrganisationId'],properties:{actingOrganisationId:identifier}},{$ref:'#/components/schemas/OperationalSlaPolicy'},[policyId]),
    '/operational/exceptions': mutation('openOperationalException','Open a governed operational exception',{type:'object',additionalProperties:true},{$ref:'#/components/schemas/OperationalException'}),
    '/operational/exceptions/{exceptionId}':{
      get:{operationId:'getOperationalException',summary:'Read an operational exception and immutable transition history',security:[{bearerAuth:[]}],parameters:[exceptionId],responses:{200:ok({$ref:'#/components/schemas/OperationalException'}),401:errorResponse,403:errorResponse,404:errorResponse}},
    },
    '/operational/entities/{entityType}/{entityId}/exceptions':{
      get:{operationId:'listOperationalExceptionsForEntity',summary:'List visible operational exceptions for an entity',security:[{bearerAuth:[]}],parameters:[entityType,entityId],responses:{200:ok({type:'array',items:{$ref:'#/components/schemas/OperationalException'}}),401:errorResponse,403:errorResponse}},
    },
    '/operational/exceptions/{exceptionId}/assign': mutation('assignOperationalException','Assign an exception',{type:'object',additionalProperties:true},{$ref:'#/components/schemas/OperationalException'},[exceptionId]),
    '/operational/exceptions/{exceptionId}/wait': mutation('waitOperationalException','Put an exception into governed waiting state',{type:'object',additionalProperties:true},{$ref:'#/components/schemas/OperationalException'},[exceptionId]),
    '/operational/exceptions/{exceptionId}/escalate': mutation('escalateOperationalException','Escalate an active exception',{type:'object',additionalProperties:true},{$ref:'#/components/schemas/OperationalException'},[exceptionId]),
    '/operational/exceptions/{exceptionId}/resolve': mutation('resolveOperationalException','Resolve an exception with evidence',{type:'object',additionalProperties:true},{$ref:'#/components/schemas/OperationalException'},[exceptionId]),
    '/operational/exceptions/{exceptionId}/accept-risk': mutation('acceptOperationalExceptionRisk','Accept exception risk through Decision Ledger',{type:'object',additionalProperties:true},{$ref:'#/components/schemas/OperationalException'},[exceptionId]),
    '/operational/exceptions/{exceptionId}/close': mutation('closeOperationalException','Close a resolved or risk-accepted exception',{type:'object',additionalProperties:true},{$ref:'#/components/schemas/OperationalException'},[exceptionId]),
  };
}
function deepFreeze(value){if(!value||typeof value!=='object'||Object.isFrozen(value))return value;Object.freeze(value);for(const nested of Object.values(value))deepFreeze(nested);return value;}
