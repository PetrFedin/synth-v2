import test from 'node:test';
import assert from 'node:assert/strict';
import { createProductionExecutionService } from '../src/application/production-execution-service.mjs';

const productionOrder=Object.freeze({
  id:'po-id-1',productionOrderNumber:'PO-STYLE-001',status:'confirmed',version:3,brandId:'brand-1',supplierCode:'FACTORY-01',sku:'STYLE-001',quantity:500,
  productionStartAt:'2026-08-10T00:00:00.000Z',deliveryDueAt:'2026-10-30T00:00:00.000Z',confirmedAt:'2026-08-06T10:00:00.000Z',
  confirmation:Object.freeze({confirmationReference:'PO-ACK-1201'}),techPackSnapshot:Object.freeze({techPackCode:'TP-STYLE-001-R01',version:3}),
});

function harness(){
  const executions=new Map(),commands=new Map(),events=[];let sequence=0,tick=0;
  const membership=Object.freeze({organisationId:'brand-1',organisationType:'brand',userId:'planner-1',role:'owner',status:'active'});
  const tx={
    getCommand:async(id)=>commands.get(id),insertCommand:async(v)=>commands.set(v.id,v),getMembership:async()=>membership,
    getProductionOrderByNumber:async(number)=>number===productionOrder.productionOrderNumber?productionOrder:undefined,
    getExecutionByProductionOrderNumber:async(number)=>[...executions.values()].find((v)=>v.productionOrderNumber===number),
    getExecutionByCode:async(code)=>executions.get(code),insertExecution:async(v)=>executions.set(v.executionCode,v),
    saveExecution:async(v,expected)=>{assert.equal(executions.get(v.executionCode).version,expected);executions.set(v.executionCode,v)},
    appendOutbox:async(event)=>events.push(event),
  };
  const times=['2026-08-06T12:00:00.000Z','2026-08-10T08:00:00.000Z','2026-08-12T00:00:00.000Z','2026-08-14T00:00:00.000Z','2026-08-15T00:00:00.000Z'];
  const service=createProductionExecutionService({store:{transaction:(work)=>work(tx)},clock:()=>times[Math.min(tick++,times.length-1)],nextId:(prefix)=>`${prefix}-${++sequence}`});
  return{service,executions,commands,events};
}

test('service creates, starts, blocks, resolves and completes the current milestone',async()=>{
  const f=harness();
  let execution=await f.service.createFromProductionOrder('c1','planner-1',productionOrder.productionOrderNumber);
  execution=await f.service.start('c2','planner-1',execution.executionCode,{expectedVersion:execution.version});
  execution=await f.service.blockMilestone('c3','planner-1',execution.executionCode,{expectedVersion:execution.version,milestoneCode:'materials-ready',reason:'Bulk fabric inspection failed'});
  execution=await f.service.resolveMilestone('c4','planner-1',execution.executionCode,{expectedVersion:execution.version,milestoneCode:'materials-ready',notes:'Replacement bulk approved'});
  execution=await f.service.completeMilestone('c5','planner-1',execution.executionCode,{expectedVersion:execution.version,milestoneCode:'materials-ready',notes:'Fabric released'});
  assert.equal(execution.milestones[0].status,'completed');
  assert.deepEqual(f.events.map((event)=>event.type),['production-execution.created','production-execution.started','production-milestone.blocked','production-milestone.unblocked','production-milestone.completed']);
});

test('service prevents duplicate calendars and stale milestone writes',async()=>{
  const f=harness();
  const execution=await f.service.createFromProductionOrder('c1','planner-1',productionOrder.productionOrderNumber);
  await assert.rejects(()=>f.service.createFromProductionOrder('c2','planner-1',productionOrder.productionOrderNumber),{code:'PRODUCTION_EXECUTION_FOR_PO_EXISTS'});
  await assert.rejects(()=>f.service.start('c3','planner-1',execution.executionCode,{expectedVersion:99}),{code:'PRODUCTION_EXECUTION_CONCURRENCY_CONFLICT'});
});

test('replayed command returns its original result without duplicate event',async()=>{
  const f=harness();
  const first=await f.service.createFromProductionOrder('c1','planner-1',productionOrder.productionOrderNumber);
  const replay=await f.service.createFromProductionOrder('c1','planner-1',productionOrder.productionOrderNumber);
  assert.deepEqual(replay,first);assert.equal(f.executions.size,1);assert.equal(f.events.length,1);
});
