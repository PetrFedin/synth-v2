(function initializeFinalQualityCore(global){
  'use strict';
  function currentRun(value){return Array.isArray(value?.runs)&&value.runs.length?value.runs[value.runs.length-1]:null}
  function allowedActions(value,{canManage=false,canApprove=false}={}){
    if(!value)return Object.freeze([]);
    const actions=[];
    if(value.status==='planned'){if(canManage)actions.push('start');if(canApprove)actions.push('cancel')}
    else if(value.status==='in-progress'){if(canManage)actions.push('complete')}
    else if(value.status==='review-pending'){if(canApprove)actions.push('review')}
    else if(value.status==='rework-required'){if(canManage)actions.push('reinspect');if(canApprove)actions.push('cancel')}
    return Object.freeze(actions)
  }
  function summarize(values){
    const result={total:0,planned:0,inProgress:0,reviewPending:0,rework:0,released:0,rejected:0,cancelled:0};
    for(const value of Array.isArray(values)?values:[]){result.total+=1;if(value.status==='planned')result.planned+=1;else if(value.status==='in-progress')result.inProgress+=1;else if(value.status==='review-pending')result.reviewPending+=1;else if(value.status==='rework-required')result.rework+=1;else if(value.status==='released')result.released+=1;else if(value.status==='rejected')result.rejected+=1;else if(value.status==='cancelled')result.cancelled+=1}
    return Object.freeze(result)
  }
  function isRisk(value){return ['rework-required','rejected'].includes(value?.status)||currentRun(value)?.recommendation==='reject'}
  function filter(values,{status='all',risk='all',search=''}={}){
    const needle=String(search).trim().toLowerCase();
    return (Array.isArray(values)?values:[]).filter((value)=>{
      if(status!=='all'&&value.status!==status)return false;
      if(risk==='risk'&&!isRisk(value))return false;
      if(risk==='release'&&value.status!=='released')return false;
      if(needle&&![value.inspectionCode,value.executionCode,value.productionOrderNumber,value.sku,value.supplierCode,value.shipmentRelease?.releaseCode].some((candidate)=>String(candidate||'').toLowerCase().includes(needle)))return false;
      return true
    })
  }
  global.SynthaFinalQualityCore=Object.freeze({allowedActions,currentRun,filter,isRisk,summarize});
})(window);
