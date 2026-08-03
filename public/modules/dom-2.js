function toast(message,type=''){const host=document.querySelector('#toast');if(!host)return;clear(host);host.append(notice(message,type));setTimeout(()=>{if(host.isConnected)clear(host);},4500);}
function clearSession(){window.SynthaWorkspaceController?.abortAll();state.token='';state.user=null;state.workspace=emptyWorkspace();state.notifications=[];sessionStorage.removeItem(TOKEN_KEY);}
function ownIds(){return state.workspace.memberships.map(x=>x.organisationId);} function ownOrganisations(type){return state.workspace.organisations.filter(x=>ownIds().includes(x.id)&&(!type||x.type===type));} function organisationsByType(type){return state.workspace.organisations.filter(x=>x.type===type);} function ownOrganisationNames(){return ownOrganisations().map(x=>x.name||x.id);} function orgName(id){return state.workspace.organisations.find(x=>x.id===id)?.name||id||'—';} function nameById(group,id){return state.workspace[group].find(x=>x.id===id)?.name||id||'—';}
function pairName(brandId,shopId){return `${orgName(brandId)} ↔ ${orgName(shopId)}`;} function counterpartyResponder(rel){return rel.requestedByOrganisationId===rel.brandId?rel.shopId:rel.brandId;}
function isoDates(values,names){const result={...values};names.forEach(name=>result[name]=toIso(result[name]));return result;} function toIso(value){const parsed=new Date(value);return Number.isNaN(parsed.valueOf())?value:parsed.toISOString();}
function formatDate(value){return I18N.formatDate(value);} function money(value){return I18N.formatNumber(value,{maximumFractionDigits:2});}
function statusLabel(value){const key=`status.${value}`;const translated=I18N.t(key);if(translated!==key)return translated;const custom={scheduled:['запланировано','scheduled'],in_progress:['в работе','in progress'],completed:['завершено','completed'],archived:['архив','archived'],rejected:['отклонено','rejected'],revoked:['отозвано','revoked'],declined:['отклонено','declined']};return custom[value]?.[I18N.getLocale()==='en'?1:0]||stageLabel(value);}
function stageLabel(value){const key=`stage.${value}`;const translated=I18N.t(key);return translated===key?String(value||'—'):translated;}
function viewTitle(view){const item=NAV.find(([id])=>id===view);return item?I18N.t(item[1]):I18N.t('nav.overview');}
function translateDataText(value){
  const text=String(value);
  const target=I18N.getLocale()==='en'?1:0;
  const prefixes=[
    ['Запрос: ','Requested by: '],['Шоурум: ','Showroom: '],['До: ','Until: '],
    ['Кампания: ','Campaign: '],['Коллекция: ','Collection: '],['Перейти: ','Move to: '],
    ['Согласовать: ','Approve: '],['Согласовано: ','Approved by: '],['Причина: ','Reason: '],
    ['Отменён: ','Cancelled at: '],['Заказ: ','Order: '],['Организация: ','Organisation: '],
    ['Объект: ','Subject: '],['Сообщений: ','Messages: '],['Место: ','Location: '],['Тип: ','Type: '],
  ];
  for(const pair of prefixes){const source=text.startsWith(pair[0])?0:text.startsWith(pair[1])?1:-1;if(source>=0)return pair[target]+text.slice(pair[source].length);}
  return text==='нет'||text==='none'?I18N.translate(text):text;
}
function emptyWorkspace(){return{memberships:[],organisations:[],relationships:[],invitations:[],campaigns:[],collections:[],catalogSkus:[],showrooms:[],cycles:[],selections:[],orders:[],deals:[],calendar:[],calendarEvents:[],calendarParticipants:[],calendarReminders:[],collaborationThreads:[],collaborationMessages:[],pageInfo:{limit:0,hasMore:false,truncatedSections:[],nextCursors:{}}};}
