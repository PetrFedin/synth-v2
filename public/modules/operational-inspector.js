(function installOperationalInspector(global) {
  'use strict';

  const ui = { open: false, entity: null, data: null, loading: false, error: '', options: {} };
  const KINDS = ['general','clarification','fit','qc','sourcing','handoff','exception'];
  const OUTCOMES = ['approved','rejected','accepted_with_risk','deferred','waived','recorded'];

  function t(ru,en){ return typeof localText === 'function' ? localText(ru,en) : ru; }
  function caps(){ return global.SynthaUiCapabilities; }
  function organisations(capability){
    const ws = global.state?.workspace || (typeof state !== 'undefined' ? state.workspace : {});
    return caps()?.organisationIds?.(ws, capability) || [];
  }
  function orgLabel(id){
    const ws = global.state?.workspace || (typeof state !== 'undefined' ? state.workspace : {});
    const org = (ws?.organisations || []).find(item => item.id === id);
    return org?.name || org?.legalName || id;
  }
  function normalizeEntity(input){
    const type = String(input?.type || '').trim();
    const id = String(input?.id || '').trim();
    if (!type || !id) throw new Error(t('Нужны тип и идентификатор объекта.','Entity type and id are required.'));
    return { type, id, version: input?.version ?? null, contentHash: input?.contentHash ?? null };
  }
  function endpoint(entity){ return '/v2/operational/entities/' + encodeURIComponent(entity.type) + '/' + encodeURIComponent(entity.id) + '/collaboration'; }
  function root(){
    let host = document.querySelector('[data-operational-inspector-root]');
    if (host) return host;
    host = document.createElement('div');
    host.dataset.operationalInspectorRoot = 'true';
    document.body.append(host);
    return host;
  }
  function node(tag, className, text){
    const n=document.createElement(tag);
    if(className) n.className=className;
    if(text!==undefined) n.textContent=String(text);
    return n;
  }
  function button(label, cls='secondary'){
    const b=node('button','button '+cls,label); b.type='button'; return b;
  }
  function select(options, value){
    const s=node('select','od-op-select');
    for(const [v,label] of options){ const o=node('option','',label); o.value=v; s.append(o); }
    if(value!==undefined) s.value=value; return s;
  }
  async function refresh(){
    if(!ui.entity) return;
    ui.loading=true; ui.error=''; render();
    try { ui.data = await api(endpoint(ui.entity)); }
    catch(error){ ui.error=error?.message || t('Не удалось загрузить обсуждения.','Could not load collaboration.'); }
    finally { ui.loading=false; render(); }
  }
  function open(entity, options={}){
    ui.entity=normalizeEntity(entity); ui.options=options; ui.open=true; ui.data=null; ui.error=''; render(); void refresh();
  }
  function close(){ ui.open=false; render(); }
  function summary(){
    const e=ui.entity;
    const wrap=node('div','od-op-summary');
    wrap.append(node('div','od-op-eyebrow',t('Контекст объекта','Entity context')));
    wrap.append(node('h2','od-op-title',ui.options.title || e?.id || ''));
    wrap.append(node('div','od-op-meta',e ? e.type + ' · ' + e.id + (e.version ? ' · v'+e.version : '') : ''));
    return wrap;
  }
  function render(){
    const host=root(); host.replaceChildren();
    if(!ui.open) return;
    const backdrop=node('div','od-op-backdrop');
    backdrop.addEventListener('click', close);
    const aside=node('aside','od-op-inspector');
    aside.setAttribute('role','dialog'); aside.setAttribute('aria-modal','true'); aside.setAttribute('aria-label',t('Обсуждения и решения','Collaboration and decisions'));
    const header=node('header','od-op-header'); header.append(summary());
    const x=button('×','ghost'); x.classList.add('od-op-close'); x.setAttribute('aria-label',t('Закрыть','Close')); x.addEventListener('click',close); header.append(x);
    const body=node('div','od-op-body');
    if(ui.loading) body.append(node('p','muted',t('Загрузка…','Loading…')));
    else if(ui.error) body.append(node('div','notice error',ui.error));
    else if(ui.data) body.append(renderThreads(), renderDecisions(), renderCreateThread(), renderDecisionForm());
    aside.append(header,body); host.append(backdrop,aside);
  }
  function section(title){ const s=node('section','od-op-section'); s.append(node('h3','od-op-section-title',title)); return s; }
  function renderThreads(){
    const s=section(t('Обсуждения','Threads')); const threads=ui.data?.threads || [];
    if(!threads.length) s.append(node('p','muted',t('Обсуждений пока нет.','No threads yet.')));
    for(const thread of threads){
      const card=node('article','od-op-card');
      const head=node('div','od-op-card-head'); head.append(node('strong','',thread.title), node('span','od-op-status',thread.status));
      card.append(head,node('div','od-op-meta',thread.kind+' · '+(thread.participantOrganisationIds||[]).map(orgLabel).join(', ')));
      const msgs=node('div','od-op-messages');
      for(const m of thread.messages||[]){
        const row=node('div','od-op-message'); row.append(node('div','od-op-message-meta',orgLabel(m.authorOrganisationId)+' · '+formatDate(m.createdAt)),node('div','',m.body)); msgs.append(row);
      }
      card.append(msgs);
      if(thread.status==='open') card.append(threadComposer(thread));
      s.append(card);
    }
    return s;
  }
  function threadComposer(thread){
    const wrap=node('div','od-op-composer'); const ta=node('textarea','od-op-textarea'); ta.rows=2; ta.placeholder=t('Сообщение…','Message…');
    const actions=node('div','od-op-actions'); const send=button(t('Отправить','Send'),'primary');
    send.addEventListener('click',async()=>{ const body=ta.value.trim(); if(!body)return; const orgId=actingOrgForThread(thread,'COLLABORATION_WRITE'); if(!orgId)return;
      send.disabled=true; try{ await mutate('/v2/operational/threads/'+encodeURIComponent(thread.id)+'/messages',{actingOrganisationId:orgId,body}); ta.value=''; await refresh(); }catch(e){ ui.error=e.message; render(); } finally{send.disabled=false;} });
    const resolve=button(t('Закрыть обсуждение','Resolve'));
    resolve.addEventListener('click',async()=>{ const orgId=actingOrgForThread(thread,'COLLABORATION_WRITE'); if(!orgId)return; resolve.disabled=true; try{ await mutate('/v2/operational/threads/'+encodeURIComponent(thread.id)+'/resolve',{actingOrganisationId:orgId,expectedVersion:thread.version}); await refresh(); }catch(e){ui.error=e.message;render();} });
    actions.append(send,resolve); wrap.append(ta,actions); return wrap;
  }
  function actingOrgForThread(thread,capabilityKey){
    const C=caps()?.CAPABILITIES; const allowed=organisations(C?.[capabilityKey]);
    return (thread.participantOrganisationIds||[]).find(id=>allowed.includes(id)) || null;
  }
  function renderDecisions(){
    const s=section(t('Журнал решений','Decision ledger')); const decisions=ui.data?.decisions||[];
    if(!decisions.length) s.append(node('p','muted',t('Зафиксированных решений пока нет.','No recorded decisions yet.')));
    for(const d of decisions){
      const card=node('article','od-op-card od-op-decision'); const head=node('div','od-op-card-head');
      head.append(node('strong','',d.decisionType),node('span','od-op-status',d.outcome)); card.append(head,node('div','',d.rationale));
      card.append(node('div','od-op-meta',orgLabel(d.decidedByOrganisationId)+' · '+formatDate(d.decidedAt)+(d.supersedesDecisionId?' · ↳ '+d.supersedesDecisionId:''))); s.append(card);
    }
    return s;
  }
  function renderCreateThread(){
    const C=caps()?.CAPABILITIES; const owners=organisations(C?.COLLABORATION_WRITE); if(!owners.length) return document.createDocumentFragment();
    const s=section(t('Новое обсуждение','New thread')); const title=node('input','od-op-input'); title.placeholder=t('Тема обсуждения','Thread title');
    const owner=select(owners.map(id=>[id,orgLabel(id)])); const kind=select(KINDS.map(v=>[v,v]));
    const create=button(t('Создать обсуждение','Create thread'),'primary');
    create.addEventListener('click',async()=>{ if(title.value.trim().length<2)return; create.disabled=true; try{ await mutate('/v2/operational/threads',{ownerOrganisationId:owner.value,participantOrganisationIds:[],entity:ui.entity,title:title.value.trim(),kind:kind.value}); title.value=''; await refresh(); }catch(e){ui.error=e.message;render();} finally{create.disabled=false;} });
    const grid=node('div','od-op-form-grid'); grid.append(owner,kind); s.append(title,grid,create); return s;
  }
  function renderDecisionForm(){
    const C=caps()?.CAPABILITIES; const orgs=organisations(C?.DECISION_RECORD); if(!orgs.length) return document.createDocumentFragment();
    const s=section(t('Зафиксировать решение','Record decision')); const type=node('input','od-op-input'); type.placeholder=t('Тип решения','Decision type');
    const rationale=node('textarea','od-op-textarea'); rationale.rows=3; rationale.placeholder=t('Основание решения','Rationale');
    const org=select(orgs.map(id=>[id,orgLabel(id)])); const outcome=select(OUTCOMES.map(v=>[v,v]),'recorded');
    const threadOptions=[['',t('Без привязки к обсуждению','No thread')],...(ui.data?.threads||[]).filter(x=>x.status!=='archived').map(x=>[x.id,x.title])]; const thread=select(threadOptions);
    const save=button(t('Записать решение','Record decision'),'primary');
    save.addEventListener('click',async()=>{ if(type.value.trim().length<2||rationale.value.trim().length<2)return; save.disabled=true; try{ await mutate('/v2/operational/decisions',{actingOrganisationId:org.value,threadId:thread.value||undefined,entity:ui.entity,decisionType:type.value.trim(),outcome:outcome.value,rationale:rationale.value.trim(),evidenceRefs:[]}); type.value=''; rationale.value=''; await refresh(); }catch(e){ui.error=e.message;render();} finally{save.disabled=false;} });
    const grid=node('div','od-op-form-grid'); grid.append(org,outcome,thread); s.append(type,rationale,grid,save); return s;
  }
  function mountAction(host, entity, options={}){
    const b=button(options.label || t('Обсуждения и решения','Threads & decisions'));
    b.classList.add('od-op-launch'); b.addEventListener('click',()=>open(entity,options)); host.append(b); return b;
  }
  function formatDate(value){ try{return new Intl.DateTimeFormat(I18N.localeTag(),{dateStyle:'medium',timeStyle:'short'}).format(new Date(value));}catch{return String(value||'');} }

  global.addEventListener('syntha:operational-inspector', event => open(event.detail?.entity || event.detail, event.detail?.options || {}));
  global.addEventListener('syntha:locale-changed',()=>{ if(ui.open) render(); });
  global.SynthaOperationalInspector=Object.freeze({open,close,refresh,mountAction});
})(window);
