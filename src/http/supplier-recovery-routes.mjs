import { invariant } from '../core/errors.mjs';
import { assertBodyContract, assertQueryContract, bodyContract } from './request-contract.mjs';

const RECOVERY_BODY = bodyContract(['supplierCode','amount','currency','fxRateSnapshotId','orderLineNo','productSkuId','sku','sourceRef','occurredAt','reason']);

export function createSupplierRecoveryRoutes({ supplierRecovery } = {}) {
  const service = supplierRecovery ?? unavailable();
  return Object.freeze([
    Object.freeze({
      method:'POST', pattern:/^\/v2\/receipt-claim-resolutions\/([^/]+)\/supplier-recoveries$/, mutation:true,
      execute(context){ assertQueryContract(context.query??{},[]); validate(context.body); return service.recordRecovery(context.commandId,context.actorId,context.params[0],context.body); },
    }),
    Object.freeze({
      method:'GET', pattern:/^\/v2\/supplier-recoveries\/([^/]+)$/, mutation:false,
      execute(context){ assertQueryContract(context.query??{},[]); return service.getRecoveryForActor(context.actorId,context.params[0]); },
    }),
  ]);
}
function validate(body){
  assertBodyContract(body,RECOVERY_BODY);
  text(body.supplierCode,'supplierCode',2,64);
  invariant(typeof body.amount==='number'&&Number.isFinite(body.amount)&&body.amount>0,'HTTP_BODY_FIELD_INVALID','amount must be a positive finite number',{field:'amount'});
  text(body.currency,'currency',3,3); invariant(/^[A-Z]{3}$/.test(body.currency),'HTTP_BODY_FIELD_INVALID','currency must be ISO-4217',{field:'currency'});
  optionalText(body.fxRateSnapshotId,'fxRateSnapshotId',200);
  validateLineIdentity(body);
  text(body.sourceRef,'sourceRef',1,240); text(body.reason,'reason',2,1000);
  invariant(typeof body.occurredAt==='string'&&Number.isFinite(Date.parse(body.occurredAt)),'HTTP_BODY_FIELD_INVALID','occurredAt must be ISO date-time',{field:'occurredAt'});
}
function validateLineIdentity(body){
  const hasIdentity=body.orderLineNo!==undefined||body.productSkuId!==undefined||body.sku!==undefined;
  if(!hasIdentity)return;
  invariant(body.orderLineNo!==undefined&&body.productSkuId!==undefined,'HTTP_BODY_FIELD_INVALID','SKU-specific supplier recovery requires orderLineNo and productSkuId together',{field:'orderLineNo'});
  invariant(Number.isInteger(body.orderLineNo)&&body.orderLineNo>0&&body.orderLineNo<=2_147_483_647,'HTTP_BODY_FIELD_INVALID','orderLineNo must be a positive integer',{field:'orderLineNo'});
  text(body.productSkuId,'productSkuId',1,200);
  optionalText(body.sku,'sku',160);
}
function text(value,field,min,max){const v=typeof value==='string'?value.trim():'';invariant(v.length>=min&&v.length<=max,'HTTP_BODY_FIELD_INVALID',`${field} must contain ${min} to ${max} characters`,{field});}
function optionalText(value,field,max){if(value===undefined||value===null||value==='')return;text(value,field,1,max);}
function unavailable(){const fail=()=>invariant(false,'SUPPLIER_RECOVERY_SERVICE_REQUIRED','Supplier recovery service is required');return Object.freeze({recordRecovery:fail,getRecoveryForActor:fail});}
