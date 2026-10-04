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
  // Пооперационный контроль ничего не держит, пока проверок нет. The fixture makes that the default
  // and lets a test open one, because the gate is only interesting when there is something to gate.
  const openInlineChecks=[];
  const inspections=new Map();
  // Ведомость и выдачи материала: по умолчанию ведомости нет, и закрытие последней вехи ничего не спрашивает.
  const material={bom:null,issues:[]};
  const membership=Object.freeze({organisationId:'brand-1',organisationType:'brand',userId:'planner-1',role:'owner',status:'active'});
  const tx={
    getCommand:async(id)=>commands.get(id),insertCommand:async(v)=>commands.set(v.id,v),getMembership:async()=>membership,
    getProductionOrderByNumber:async(number)=>number===productionOrder.productionOrderNumber?productionOrder:undefined,
    getExecutionByProductionOrderNumber:async(number)=>[...executions.values()].find((v)=>v.productionOrderNumber===number),
    getExecutionByCode:async(code)=>executions.get(code),listOpenInlineChecks:async()=>openInlineChecks,getQualityInspectionByExecutionCode:async(code)=>inspections.get(code),insertExecution:async(v)=>executions.set(v.executionCode,v),
    saveExecution:async(v,expected)=>{assert.equal(executions.get(v.executionCode).version,expected);executions.set(v.executionCode,v)},
    getPublishedBomForSku:async()=>material.bom,listMaterialLotIssuesForExecution:async()=>material.issues,
    appendOutbox:async(event)=>events.push(event),
  };
  const times=['2026-08-06T12:00:00.000Z','2026-08-10T08:00:00.000Z','2026-08-12T00:00:00.000Z','2026-08-14T00:00:00.000Z','2026-08-15T00:00:00.000Z'];
  const service=createProductionExecutionService({store:{transaction:(work)=>work(tx)},clock:()=>times[Math.min(tick++,times.length-1)],nextId:(prefix)=>`${prefix}-${++sequence}`});
  return{service,executions,commands,events,openInlineChecks,inspections,material};
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

test('A stage is not signed off while the defects found on it are undecided',async()=>{
  const f=harness();
  let execution=await f.service.createFromProductionOrder('gate-create','planner-1',productionOrder.productionOrderNumber);
  execution=await f.service.start('gate-start','planner-1',execution.executionCode,{expectedVersion:execution.version});
  // An inline check found defects at the current stage and nobody has decided what happens to them.
  f.openInlineChecks.push({milestoneCode:'materials-ready',checkNumber:1,status:'open'});
  await assert.rejects(()=>f.service.completeMilestone('gate-block','planner-1',execution.executionCode,{expectedVersion:execution.version,milestoneCode:'materials-ready',notes:'materials-ready completed'}),{code:'PRODUCTION_MILESTONE_HAS_OPEN_INLINE_CHECK'});
  // Deciding closes it, and the stage signs off as it always did.
  f.openInlineChecks.length=0;
  execution=await f.service.completeMilestone('gate-pass','planner-1',execution.executionCode,{expectedVersion:execution.version,milestoneCode:'materials-ready',notes:'materials-ready completed'});
  assert.equal(execution.milestones[0].status,'completed');
});

// Q-01: a ready-for-qc execution whose Final Quality inspection was cancelled had no way forward.
test('service cancels a ready-for-qc execution only when its Final Quality inspection is not live',async()=>{
  const f=harness();
  let execution=await f.service.createFromProductionOrder('c1','planner-1',productionOrder.productionOrderNumber);
  execution=await f.service.start('c2','planner-1',execution.executionCode,{expectedVersion:execution.version});
  const ready={...execution,status:'ready-for-qc',version:execution.version+1,readyForQcAt:'2026-10-20T00:00:00.000Z',milestones:execution.milestones.map((m)=>({...m,status:'completed'}))};
  f.executions.set(ready.executionCode,ready);
  f.inspections.set(ready.executionCode,{inspectionCode:'QCI-PO-STYLE-001',status:'released'});
  await assert.rejects(()=>f.service.cancel('c3','planner-1',ready.executionCode,{expectedVersion:ready.version,reason:'Lot scrapped at the factory'}),{code:'PRODUCTION_EXECUTION_QUALITY_INSPECTION_LIVE'});
  f.inspections.set(ready.executionCode,{inspectionCode:'QCI-PO-STYLE-001',status:'cancelled'});
  const cancelled=await f.service.cancel('c4','planner-1',ready.executionCode,{expectedVersion:ready.version,reason:'Lot scrapped at the factory'});
  assert.equal(cancelled.status,'cancelled');
  assert.equal(f.events.at(-1).type,'production-execution.cancelled');
});

// Q-01 (ловушка порядка). Материал выдаётся только в активное исполнение, а допуск к отгрузке требует
// записи выдачи; закрытие последней вехи отнимало у человека последний шанс выдать.
test('the last milestone is refused while a main material of the bill has no issue, and the refusal names it',async()=>{
  const f=harness();
  f.material.bom={lines:[{materialCode:'FAB-SHELL',materialType:'fabric'},{materialCode:'FAB-LINING',materialType:'fabric'},{materialCode:'BTN-1',materialType:'trim'}]};
  let execution=await f.service.createFromProductionOrder('c1','planner-1',productionOrder.productionOrderNumber);
  execution=await f.service.start('c2','planner-1',execution.executionCode,{expectedVersion:execution.version});
  // Материал не спрашивается на промежуточных вехах: он нужен к концу, а не к началу.
  for(const code of ['materials-ready','cutting-complete','assembly-complete','finishing-complete','packing-complete']){
    execution=await f.service.completeMilestone(`m-${code}`,'planner-1',execution.executionCode,{expectedVersion:execution.version,milestoneCode:code,notes:'done'});
  }
  assert.equal(execution.status,'active');
  await assert.rejects(()=>f.service.completeMilestone('last-1','planner-1',execution.executionCode,{expectedVersion:execution.version,milestoneCode:'ready-for-qc',notes:'done'}),(error)=>{
    assert.equal(error.code,'PRODUCTION_READY_FOR_QC_WITHOUT_MATERIAL');
    assert.deepEqual(error.details.missingMaterials,['FAB-SHELL','FAB-LINING']);
    return true;
  });
  assert.equal(f.executions.get(execution.executionCode).status,'active','a refusal leaves the execution active, where material can still be issued');
  // Пуговицы — не основной материал; одна ткань из двух всё ещё не закрывает вопрос.
  f.material.issues=[{materialCode:'FAB-SHELL',quantity:10},{materialCode:'BTN-1',quantity:10}];
  await assert.rejects(()=>f.service.completeMilestone('last-2','planner-1',execution.executionCode,{expectedVersion:execution.version,milestoneCode:'ready-for-qc',notes:'done'}),(error)=>error.code==='PRODUCTION_READY_FOR_QC_WITHOUT_MATERIAL'&&error.details.missingMaterials.join()==='FAB-LINING');
  f.material.issues.push({materialCode:'FAB-LINING',quantity:5});
  const ready=await f.service.completeMilestone('last-3','planner-1',execution.executionCode,{expectedVersion:execution.version,milestoneCode:'ready-for-qc',notes:'done'});
  assert.equal(ready.status,'ready-for-qc');
});

// Повторная приёмка: выдано 200 м из 256,8 м — раньше веха закрывалась, и исполнение застревало.
test('the last milestone is refused while the issued main material does not cover the requirement',async()=>{
  const f=harness();
  f.material.bom={lines:[{materialCode:'FAB-SHELL',materialType:'fabric',unit:'m',quantity:0.4,grossQuantity:0.5136},{materialCode:'BTN-1',materialType:'trim',unit:'pcs',quantity:5,grossQuantity:5}]};
  let execution=await f.service.createFromProductionOrder('c1','planner-1',productionOrder.productionOrderNumber);
  execution=await f.service.start('c2','planner-1',execution.executionCode,{expectedVersion:execution.version});
  for(const code of ['materials-ready','cutting-complete','assembly-complete','finishing-complete','packing-complete']){
    execution=await f.service.completeMilestone(`m-${code}`,'planner-1',execution.executionCode,{expectedVersion:execution.version,milestoneCode:code,notes:'done'});
  }
  // 500 изделий x 0,5136 = 256,8 м.
  f.material.issues=[{materialCode:'FAB-SHELL',quantity:200}];
  await assert.rejects(()=>f.service.completeMilestone('short-1','planner-1',execution.executionCode,{expectedVersion:execution.version,milestoneCode:'ready-for-qc',notes:'done'}),(error)=>{
    assert.equal(error.code,'PRODUCTION_READY_FOR_QC_MATERIAL_SHORTFALL');
    assert.deepEqual(error.details.shortfalls,[{materialCode:'FAB-SHELL',unit:'m',requiredQuantity:256.8,issuedQuantity:200,shortfallQuantity:56.8}]);
    return true;
  });
  assert.equal(f.executions.get(execution.executionCode).status,'active','the refusal leaves the execution active, where the rest can still be issued');
  f.material.issues.push({materialCode:'FAB-SHELL',quantity:56.8});
  const ready=await f.service.completeMilestone('short-2','planner-1',execution.executionCode,{expectedVersion:execution.version,milestoneCode:'ready-for-qc',notes:'done'});
  assert.equal(ready.status,'ready-for-qc');
});

test('a bill that does not exist cannot judge the last milestone',async()=>{
  const f=harness();
  let execution=await f.service.createFromProductionOrder('c1','planner-1',productionOrder.productionOrderNumber);
  execution=await f.service.start('c2','planner-1',execution.executionCode,{expectedVersion:execution.version});
  for(const code of ['materials-ready','cutting-complete','assembly-complete','finishing-complete','packing-complete','ready-for-qc']){
    execution=await f.service.completeMilestone(`m-${code}`,'planner-1',execution.executionCode,{expectedVersion:execution.version,milestoneCode:code,notes:'done'});
  }
  assert.equal(execution.status,'ready-for-qc');
});
