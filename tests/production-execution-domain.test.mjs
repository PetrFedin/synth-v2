import test from 'node:test';
import assert from 'node:assert/strict';
import {
  blockProductionMilestone,
  cancelProductionExecution,
  completeProductionMilestone,
  createProductionExecution,
  resolveProductionMilestoneBlock,
  startProductionExecution,
} from '../src/modules/production-execution/public.mjs';

const confirmedOrder = Object.freeze({
  id: 'po-id-1', productionOrderNumber: 'PO-STYLE-001', status: 'confirmed', version: 3,
  brandId: 'brand-1', supplierCode: 'FACTORY-01', sku: 'STYLE-001', quantity: 500,
  productionStartAt: '2026-08-10T00:00:00.000Z', deliveryDueAt: '2026-10-30T00:00:00.000Z',
  confirmedAt: '2026-08-06T10:00:00.000Z',
  confirmation: Object.freeze({ confirmationReference: 'PO-ACK-1201' }),
  techPackSnapshot: Object.freeze({ techPackCode: 'TP-STYLE-001-R01', version: 3 }),
});
function planned(){return createProductionExecution({ id:'execution-1', productionOrder:confirmedOrder, createdAt:'2026-08-06T12:00:00.000Z' })}
function active(){return startProductionExecution(planned(),{ actorId:'planner-1', startedAt:'2026-08-10T08:00:00.000Z' })}

test('confirmed Production Order creates a deterministic six-stage schedule',()=>{
  const execution=planned();
  assert.equal(execution.status,'planned');
  assert.equal(execution.executionCode,'EXEC-PO-STYLE-001');
  assert.deepEqual(execution.milestones.map((m)=>m.code),['materials-ready','cutting-complete','assembly-complete','finishing-complete','packing-complete','ready-for-qc']);
  assert.deepEqual(execution.milestones.map((m)=>m.sequence),[1,2,3,4,5,6]);
  assert.ok(execution.milestones.every((m)=>m.status==='pending'));
  assert.equal(execution.sourceSnapshot.confirmationReference,'PO-ACK-1201');
  assert.equal(Object.isFrozen(execution.milestones),true);
});

test('unconfirmed Production Order cannot create a production schedule',()=>{
  assert.throws(()=>createProductionExecution({ id:'execution-2', productionOrder:{...confirmedOrder,status:'issued'}, createdAt:'2026-08-06T12:00:00.000Z' }),{code:'PRODUCTION_EXECUTION_PO_NOT_CONFIRMED'});
});

test('milestones must complete strictly in sequence',()=>{
  const execution=active();
  assert.throws(()=>completeProductionMilestone(execution,{milestoneCode:'cutting-complete',actorId:'planner-1',notes:null,completedAt:'2026-08-15T00:00:00.000Z'}),{code:'PRODUCTION_MILESTONE_SEQUENCE_VIOLATION'});
  const completed=completeProductionMilestone(execution,{milestoneCode:'materials-ready',actorId:'planner-1',notes:'Fabric released',completedAt:'2026-08-15T00:00:00.000Z'});
  assert.equal(completed.milestones[0].status,'completed');
  assert.equal(completed.milestones[0].completedBy,'planner-1');
  assert.equal(completed.status,'active');
});

test('current milestone can be blocked, resolved and then completed without losing audit history',()=>{
  let execution=active();
  execution=blockProductionMilestone(execution,{milestoneCode:'materials-ready',actorId:'planner-1',reason:'Bulk fabric inspection failed',blockedAt:'2026-08-12T00:00:00.000Z'});
  assert.equal(execution.milestones[0].status,'blocked');
  assert.throws(()=>completeProductionMilestone(execution,{milestoneCode:'materials-ready',actorId:'planner-1',notes:null,completedAt:'2026-08-13T00:00:00.000Z'}),{code:'PRODUCTION_MILESTONE_NOT_PENDING'});
  execution=resolveProductionMilestoneBlock(execution,{milestoneCode:'materials-ready',actorId:'planner-1',notes:'Replacement bulk approved',resolvedAt:'2026-08-14T00:00:00.000Z'});
  execution=completeProductionMilestone(execution,{milestoneCode:'materials-ready',actorId:'planner-1',notes:'Replacement released',completedAt:'2026-08-15T00:00:00.000Z'});
  assert.equal(execution.milestones[0].status,'completed');
  assert.equal(execution.milestones[0].blockReason,'Bulk fabric inspection failed');
  assert.equal(execution.milestones[0].resolutionNotes,'Replacement bulk approved');
});

test('final milestone closes production execution as ready-for-qc and prevents cancellation',()=>{
  let execution=active();
  const times=['2026-08-15','2026-08-25','2026-09-20','2026-10-05','2026-10-15','2026-10-20'];
  for(let index=0;index<execution.milestones.length;index+=1){execution=completeProductionMilestone(execution,{milestoneCode:execution.milestones[index].code,actorId:'planner-1',notes:null,completedAt:`${times[index]}T00:00:00.000Z`})}
  assert.equal(execution.status,'ready-for-qc');
  assert.equal(execution.readyForQcAt,'2026-10-20T00:00:00.000Z');
  assert.throws(()=>cancelProductionExecution(execution,{reason:'Too late to cancel',cancelledAt:'2026-10-21T00:00:00.000Z'}),{code:'PRODUCTION_EXECUTION_NOT_CANCELLABLE'});
});
