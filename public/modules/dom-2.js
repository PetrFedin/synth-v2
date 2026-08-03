function toast(message,type=''){const host=document.querySelector('#toast');if(!host)return;clear(host);host.append(notice(message,type));setTimeout(()=>{if(host.isConnected)clear(host);},4500);}
function clearSession(){state.token='';state.user=null;state.workspace=emptyWorkspace();state.notifications=[];window.SynthaWorkspaceController?.reset(state.workspace);sessionStorage.removeItem(TOKEN_KEY);}
function ownIds(){return state.workspace.memberships.map(x=>x.organisationId);} function ownOrganisations(type){return state.workspace.organisations.filter(x=>ownIds().includes(x.id)&&(!type||x.type===type));} function organisationsByType(type){return state.workspace.organisations.filter(x=>x.type===type);} function ownOrganisationNames(){return ownOrganisations().map(x=>x.name||x.id);} function orgName(id){return state.workspace.organisations.find(x=>x.id===id)?.name||id||'\u2014';} function nameById(group,id){return state.workspace[group].find(x=>x.id===id)?.name||id||'\u2014';}
function pairName(brandId,shopId){return `${orgName(brandId)} \u2194 ${orgName(shopId)}`;} function counterpartyResponder(rel){return rel.requestedByOrganisationId===rel.brandId?rel.shopId:rel.brandId;}
function isoDates(values,names){const result={...values};names.forEach(name=>result[name]=toIso(result[name]));return result;} function toIso(value){const parsed=new Date(value);return Number.isNaN(parsed.valueOf())?value:parsed.toISOString();}
function formatDate(value){return I18N.formatDate(value);} function money(value){return I18N.formatNumber(value,{maximumFractionDigits:2});}
function statusLabel(value){const key=`status.${value}`;const translated=I18N.t(key);return translated===key?stageLabel(value):translated;}
function stageLabel(value){const key=`stage.${value}`;const translated=I18N.t(key);return translated===key?String(value||'\u2014'):translated;}
function viewTitle(view){const item=NAV.find(([id])=>id===view);return item?I18N.t(item[1]):I18N.t('nav.overview');}
function translateDataText(value){
  const text=String(value);
  const target=I18N.getLocale()==='en'?1:0;
  const prefixes=[
    ['\u0417\u0430\u043f\u0440\u043e\u0441: ','Requested by: '],['\u0428\u043e\u0443\u0440\u0443\u043c: ','Showroom: '],['\u0414\u043e: ','Until: '],
    ['\u041a\u0430\u043c\u043f\u0430\u043d\u0438\u044f: ','Campaign: '],['\u041a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u044f: ','Collection: '],['\u041f\u0435\u0440\u0435\u0439\u0442\u0438: ','Move to: '],
    ['\u0421\u043e\u0433\u043b\u0430\u0441\u043e\u0432\u0430\u0442\u044c: ','Approve: '],['\u0421\u043e\u0433\u043b\u0430\u0441\u043e\u0432\u0430\u043d\u043e: ','Approved by: '],['\u041f\u0440\u0438\u0447\u0438\u043d\u0430: ','Reason: '],
    ['\u041e\u0442\u043c\u0435\u043d\u0451\u043d: ','Cancelled at: '],['\u0417\u0430\u043a\u0430\u0437: ','Order: '],['\u041e\u0440\u0433\u0430\u043d\u0438\u0437\u0430\u0446\u0438\u044f: ','Organisation: '],
  ];
  for(const pair of prefixes){const source=text.startsWith(pair[0])?0:text.startsWith(pair[1])?1:-1;if(source>=0)return pair[target]+text.slice(pair[source].length);}
  return text==='\u043d\u0435\u0442'||text==='none'?I18N.translate(text):text;
}
function emptyWorkspace(){return{memberships:[],organisations:[],relationships:[],invitations:[],campaigns:[],collections:[],catalogSkus:[],showrooms:[],cycles:[],selections:[],orders:[],deals:[],calendar:[],pageInfo:{limit:0,hasMore:false,truncatedSections:[],nextCursors:{}}};}
