import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migratePostgres } from '../src/infrastructure/postgres-migrator.mjs';
import { createOperationalExceptionService } from '../src/application/operational-exception-service.mjs';
import { createPostgresOperationalExceptionStore } from '../src/infrastructure/postgres-operational-exception-store.mjs';
import { createAwaitingActionQueryService } from '../src/application/awaiting-action-query-service.mjs';
import { createPostgresAwaitingActionReader } from '../src/infrastructure/postgres-awaiting-action-reader.mjs';
import { createEntityThread, recordDecision } from '../src/modules/operational-control/public.mjs';
import { createPostgresTestPool } from './postgres-test-pool.mjs';

const databaseUrl=process.env.POSTGRES_TEST_URL;
const now='2026-10-07T09:00:00.000Z';

test('PostgreSQL Operational Exception: SLA snapshot, Awaiting Action, transitions, risk decision and recurrence are authoritative', {skip:!databaseUrl}, async()=>{
  const pool=createPostgresTestPool({connectionString:databaseUrl,max:6});
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  let sequence=0;
  const nextId=(prefix)=>`${prefix}-oe-${++sequence}`;
  try {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await migratePostgres({pool,migrationsDir:path.join(root,'db','migrations'),clock:()=>now});
    await seed(pool);

    let clockValue=now;
    const service=createOperationalExceptionService({
      store:createPostgresOperationalExceptionStore({pool}),
      clock:()=>clockValue,
      nextId,
    });

    const policy=await service.createSlaPolicy('cmd-policy','production-user',{
      id:'production-high',
      ownerOrganisationId:'brand-oe',
      name:'Production high severity',
      responseMinutes:30,
      resolutionMinutes:120,
      escalationMinutes:60,
      applicability:{categories:['capacity_conflict'],severities:['high'],blockingOnly:true},
    });
    assert.equal(policy.version,1);
    assert.equal(policy.status,'active');

    const opened=await service.openException('cmd-open','production-user',{
      ownerOrganisationId:'brand-oe',
      entity:{type:'production-order',id:'PO-OE-1',version:3},
      category:'capacity_conflict',
      severity:'high',
      blocking:true,
      ownerRole:'production',
      threadId:'thread-oe-1',
      slaPolicyId:'production-high',
      slaPolicyVersion:1,
      recoveryAction:'Move capacity or replan the production window.',
      businessImpact:'Requested delivery is at risk.',
      sourceEventId:'capacity-event-1',
    });
    assert.equal(opened.dueAt,'2026-10-07T11:00:00.000Z');
    assert.equal(opened.slaSnapshot.version,1);

    await assert.rejects(
      service.openException('cmd-duplicate','production-user',{
        ownerOrganisationId:'brand-oe',
        entity:{type:'production-order',id:'PO-OE-1',version:3},
        category:'capacity_conflict',severity:'high',blocking:true,ownerRole:'production',threadId:'thread-oe-1',
        slaPolicyId:'production-high',slaPolicyVersion:1,recoveryAction:'Duplicate.',sourceEventId:'capacity-event-1',
      }),
      (error)=>error.code==='OPERATIONAL_EXCEPTION_ALREADY_ACTIVE',
    );

    const awaiting=createAwaitingActionQueryService({reader:createPostgresAwaitingActionReader({pool}),clock:()=>clockValue});
    const inbox=await awaiting.forActor('production-user',{type:'operational-exception'});
    assert.equal(inbox.total,1);
    assert.equal(inbox.items[0].entityId,opened.id);
    assert.equal(inbox.items[0].detail.entityId,'PO-OE-1');

    clockValue='2026-10-07T09:10:00.000Z';
    const assigned=await service.assign('cmd-assign','production-user',opened.id,{actingOrganisationId:'brand-oe',expectedVersion:1,ownerUserId:'production-user'});
    const waiting=await service.wait('cmd-wait','production-user',opened.id,{actingOrganisationId:'brand-oe',expectedVersion:2,waitingFor:'role',note:'Waiting for production planning.'});
    const escalated=await service.escalate('cmd-escalate','production-user',opened.id,{actingOrganisationId:'brand-oe',expectedVersion:3,reason:'Capacity owner did not recover the slot.'});
    assert.deepEqual([assigned.version,waiting.version,escalated.version],[2,3,4]);

    const decision=recordDecision({
      id:'decision-oe-risk',
      thread:await threadPayload(pool),
      entity:{type:'production-order',id:'PO-OE-1',version:3},
      decisionType:'capacity-risk',
      outcome:'accepted_with_risk',
      rationale:'Commercial owner accepts the delayed delivery risk.',
      decidedBy:'production-user',
      decidedByOrganisationId:'brand-oe',
      decidedAt:'2026-10-07T09:20:00.000Z',
    });
    await pool.query(
      `INSERT INTO operational_decisions
        (id,owner_organisation_id,thread_id,entity_type,entity_id,entity_version,entity_content_hash,decision_type,outcome,rationale,
         decided_by,decided_by_organisation_id,decided_at,supersedes_decision_id,payload)
       VALUES($1,'brand-oe',$2,$3,$4,$5,NULL,$6,$7,$8,$9,$10,$11,NULL,$12::jsonb)`,
      [decision.id,decision.threadId,decision.entity.type,decision.entity.id,decision.entity.version,decision.decisionType,decision.outcome,decision.rationale,decision.decidedBy,decision.decidedByOrganisationId,decision.decidedAt,JSON.stringify(decision)],
    );

    clockValue='2026-10-07T09:21:00.000Z';
    const accepted=await service.acceptRisk('cmd-risk','production-user',opened.id,{actingOrganisationId:'brand-oe',expectedVersion:4,decisionId:decision.id});
    assert.equal(accepted.state,'accepted_with_risk');
    const closed=await service.close('cmd-close','production-user',opened.id,{actingOrganisationId:'brand-oe',expectedVersion:5});
    assert.equal(closed.state,'closed');

    const persisted=await service.getForActor('production-user',opened.id);
    assert.deepEqual(persisted.transitions.map((entry)=>entry.toState),['open','assigned','waiting_for_role','escalated','accepted_with_risk','closed']);

    await assert.rejects(
      pool.query('UPDATE operational_exception_transitions SET to_state=to_state WHERE exception_id=$1',[opened.id]),
      /immutable/i,
    );

    const reopened=await service.openException('cmd-reopen','production-user',{
      ownerOrganisationId:'brand-oe',
      entity:{type:'production-order',id:'PO-OE-1',version:3},
      category:'capacity_conflict',severity:'high',blocking:true,ownerRole:'production',threadId:'thread-oe-1',
      slaPolicyId:'production-high',slaPolicyVersion:1,recoveryAction:'Recover recurring capacity issue.',sourceEventId:'capacity-event-1',
    });
    assert.notEqual(reopened.id,opened.id);
  } finally { await pool.end(); }
});

async function seed(pool){
  const org={id:'brand-oe',type:'brand',name:'Operational Brand'};
  await pool.query("INSERT INTO organisations(id,type,payload) VALUES($1,'brand',$2::jsonb)",[org.id,JSON.stringify(org)]);
  const membership={id:'membership-oe',organisationId:org.id,organisationType:'brand',userId:'production-user',role:'production',status:'active'};
  await pool.query(
    "INSERT INTO memberships(id,organisation_id,user_id,organisation_type,role,status,payload) VALUES($1,$2,$3,'brand','production','active',$4::jsonb)",
    [membership.id,org.id,membership.userId,JSON.stringify(membership)],
  );
  const thread=createEntityThread({
    id:'thread-oe-1',ownerOrganisationId:org.id,entity:{type:'production-order',id:'PO-OE-1',version:3},
    title:'Capacity exception',kind:'exception',createdBy:'production-user',createdAt:now,
  });
  await pool.query(
    `INSERT INTO operational_threads
      (id,owner_organisation_id,entity_type,entity_id,entity_version,entity_content_hash,kind,title,status,version,created_by,created_at,updated_at,payload)
     VALUES($1,$2,$3,$4,$5,NULL,$6,$7,$8,$9,$10,$11,$11,$12::jsonb)`,
    [thread.id,thread.ownerOrganisationId,thread.entity.type,thread.entity.id,thread.entity.version,thread.kind,thread.title,thread.status,thread.version,thread.createdBy,thread.createdAt,JSON.stringify(thread)],
  );
  await pool.query('INSERT INTO operational_thread_participants(thread_id,organisation_id,added_at) VALUES($1,$2,$3)',[thread.id,org.id,now]);
}
async function threadPayload(pool){
  const result=await pool.query('SELECT payload FROM operational_threads WHERE id=$1',['thread-oe-1']);
  return result.rows[0].payload;
}
