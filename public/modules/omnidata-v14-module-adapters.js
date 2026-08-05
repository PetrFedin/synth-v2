(function installOmnidataV14ModuleAdapters(global){
  'use strict';

  const BUILD='visual-20260805-14-module-adapters-2';
  const enqueue=typeof global.queueMicrotask==='function'?global.queueMicrotask.bind(global):typeof queueMicrotask==='function'?queueMicrotask:(callback)=>Promise.resolve().then(callback);
  if(typeof global.queueMicrotask!=='function')global.queueMicrotask=enqueue;
  const DEFINITIONS=Object.freeze({
    'tech-packs':{
      section:['PLM / Техническая документация','PLM / Technical Documentation'],
      title:['Технические пакеты','Tech Packs'],
      description:['Версионный производственный контракт, выпуск, подтверждение фабрики и допуск к размещению производства.','Versioned production contracts, issue, supplier acknowledgement and production-allocation readiness.'],
      source:'.tech-pack-header',actions:'.tech-pack-header-actions'
    },
    'production-orders':{
      section:['PLM / Управление производством','PLM / Production Management'],
      title:['Производственные заказы','Production Orders'],
      description:['Неизменяемые производственные заказы из распределённых запросов с коммерческими условиями, техпаком и подтверждением фабрики.','Immutable Production Orders from allocated requests with commercial terms, Tech Pack and supplier confirmation.'],
      source:'.production-orders-header',actions:'.production-orders-actions'
    }
  });
  const ROLE_MAP=Object.freeze([
    ['.tech-pack-kpis,.production-orders-kpis','metrics'],
    ['.tech-pack-kpi,.production-orders-kpi','metric'],
    ['.tech-pack-filters,.production-orders-filters','filterbar'],
    ['.production-orders-create','toolbar'],
    ['.tech-pack-layout,.production-orders-layout','master-detail'],
    ['.tech-pack-table-wrap,.production-orders-registry','table-wrap'],
    ['.tech-pack-table,.production-orders-table','table'],
    ['.tech-pack-inspector,.production-orders-inspector','inspector'],
    ['.tech-pack-facts,.production-orders-facts','definition-grid'],
    ['.tech-pack-facts>div,.production-orders-facts>div','definition-item'],
    ['.tech-pack-card,.production-orders-card,.tech-pack-readiness','surface'],
    ['.tech-pack-badge,.production-order-badge','status'],
    ['.tech-pack-empty,.production-orders-empty','empty']
  ]);
  let scheduled=false;

  function locale(){return global.SynthaI18n?.getLocale?.()==='en'?'en':'ru'}
  function text(pair){return pair[locale()==='en'?1:0]}
  function currentView(){try{return typeof state!=='undefined'?state.view:''}catch{return''}}
  function roots(selector){return [...document.querySelectorAll(selector)]}
  function setRole(selector,role){roots(selector).forEach((node)=>{node.dataset.od14Component=role})}
  function updateHeader(view,definition){
    const header=document.querySelector(`.od14-page-header[data-view="${view}"]`)||document.querySelector('.od14-page-header');
    if(!header)return;
    const section=header.querySelector('.od14-page-section');
    const title=header.querySelector('.od14-page-title');
    const description=header.querySelector('.od14-page-description');
    if(section)section.textContent=text(definition.section);
    if(title)title.textContent=text(definition.title);
    if(description)description.textContent=text(definition.description);
    const target=header.querySelector('.od14-page-actions');
    const source=document.querySelector(definition.source);
    if(!source)return;
    source.classList.add('od14-module-summary');
    const heading=source.firstElementChild;
    if(heading)heading.classList.add('od14-module-heading');
    source.querySelectorAll(`${definition.actions}>button,${definition.actions}>.button`).forEach((button)=>{
      if(target&&!button.closest('.od14-page-actions'))target.append(button);
    });
  }
  function assignRoles(){
    ROLE_MAP.forEach(([selector,role])=>setRole(selector,role));
    roots('.tech-pack-actions,.production-orders-actions,.tech-pack-confirm,.production-orders-confirm').forEach((node)=>{node.dataset.od14Component='toolbar'});
    roots('.tech-pack-filters input,.tech-pack-filters select,.production-orders-filters input,.production-orders-filters select,.production-orders-create input,.tech-pack-confirm input,.tech-pack-confirm textarea,.production-orders-confirm input,.production-orders-confirm textarea').forEach((node)=>{node.dataset.od14Component='field'});
  }
  function apply(){
    const view=currentView();
    const definition=DEFINITIONS[view];
    if(definition)updateHeader(view,definition);
    assignRoles();
    document.body.dataset.od14ModuleAdapters=BUILD;
  }
  function schedule(){if(scheduled)return;scheduled=true;enqueue(()=>{scheduled=false;apply()})}

  if(typeof renderApp==='function'){
    const previousRenderApp=renderApp;
    renderApp=(...args)=>{const result=previousRenderApp(...args);apply();return result};
  }
  global.addEventListener('syntha:locale-changed',schedule);
  global.SynthaOmnidataV14ModuleAdapters=Object.freeze({build:BUILD,apply,assignRoles,updateHeader});
})(window);
