(function initializeProductionExecutionCore(global){
  'use strict';
  const TOTAL=6;
  function currentMilestone(value){return Array.isArray(value?.milestones)?value.milestones.find((item)=>item.status!=='completed')||null:null}
  function progress(value){const completed=Array.isArray(value?.milestones)?value.milestones.filter((item)=>item.status==='completed').length:0;return Object.freeze({completed,total:TOTAL,percent:Math.round(completed/TOTAL*100)})}
  function isBlocked(value){return currentMilestone(value)?.status==='blocked'}
  function isOverdue(value,now=new Date().toISOString()){const current=currentMilestone(value);return Boolean(value?.status==='active'&&current&&Date.parse(current.dueAt)<Date.parse(now))}
  function allowedActions(value,{canManage=false}={}){
    if(!value||!canManage)return Object.freeze([]);
    if(value.status==='planned')return Object.freeze(['start','cancel']);
    if(value.status!=='active')return Object.freeze([]);
    const current=currentMilestone(value);
    if(!current)return Object.freeze([]);
    return Object.freeze(current.status==='blocked'?['resolve','cancel']:['complete','block','cancel']);
  }
  function summarize(values,now=new Date().toISOString()){
    const result={total:0,planned:0,active:0,ready:0,cancelled:0,blocked:0,overdue:0};
    for(const value of Array.isArray(values)?values:[]){result.total+=1;if(value.status==='planned')result.planned+=1;else if(value.status==='active')result.active+=1;else if(value.status==='ready-for-qc')result.ready+=1;else if(value.status==='cancelled')result.cancelled+=1;if(isBlocked(value))result.blocked+=1;if(isOverdue(value,now))result.overdue+=1}
    return Object.freeze(result)
  }
  function filter(values,{status='all',risk='all',search='',now=new Date().toISOString()}={}){
    const needle=String(search).trim().toLowerCase();
    return (Array.isArray(values)?values:[]).filter((value)=>{
      if(status!=='all'&&value.status!==status)return false;
      if(risk==='blocked'&&!isBlocked(value))return false;
      if(risk==='overdue'&&!isOverdue(value,now))return false;
      if(needle&&![value.executionCode,value.productionOrderNumber,value.sku,value.supplierCode].some((candidate)=>String(candidate||'').toLowerCase().includes(needle)))return false;
      return true
    })
  }
  global.SynthaProductionExecutionCore=Object.freeze({allowedActions,currentMilestone,filter,isBlocked,isOverdue,progress,summarize});
})(window);
