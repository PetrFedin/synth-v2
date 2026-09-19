// A toast has to outlive a re-render: every mutation ends with renderApp(), which rebuilds the root
// and with it an empty #toast host, so a message written before that call used to vanish in the same
// tick and the user saw nothing at all. The live message is kept here and repainted after each render.
let TOAST_LIVE=null; let TOAST_TIMER=0;
function toast(message,type=''){TOAST_LIVE={message,type,until:Date.now()+4500};paintToast();}
function paintToast(){const host=typeof document!=='undefined'?document.querySelector('#toast'):null;if(!host)return;clear(host);
  if(!TOAST_LIVE||Date.now()>=TOAST_LIVE.until){TOAST_LIVE=null;return;}
  host.append(notice(TOAST_LIVE.message,TOAST_LIVE.type));
  clearTimeout(TOAST_TIMER);
  TOAST_TIMER=setTimeout(()=>{TOAST_LIVE=null;const node=document.querySelector('#toast');if(node&&node.isConnected)clear(node);},Math.max(0,TOAST_LIVE.until-Date.now()));}
function clearSession(){state.token='';state.user=null;state.workspace=emptyWorkspace();state.notifications=[];state.notificationUnreadCount=0;window.SynthaWorkspaceController?.reset(state.workspace);window.SynthaNotificationController?.reset({items:[],nextCursor:null,unreadCount:0});sessionStorage.removeItem(TOKEN_KEY);}
function ownIds(){return state.workspace.memberships.map(x=>x.organisationId);} function ownOrganisations(type){return state.workspace.organisations.filter(x=>ownIds().includes(x.id)&&(!type||x.type===type));} function organisationsByType(type){return state.workspace.organisations.filter(x=>x.type===type);} function ownOrganisationNames(){return ownOrganisations().map(x=>x.name||x.id);} function orgName(id){return state.workspace.organisations.find(x=>x.id===id)?.name||id||'\u2014';} function nameById(group,id){return state.workspace[group].find(x=>x.id===id)?.name||id||'\u2014';}
function pairName(brandId,shopId){return `${orgName(brandId)} \u2194 ${orgName(shopId)}`;} function counterpartyResponder(rel){return rel.requestedByOrganisationId===rel.brandId?rel.shopId:rel.brandId;}
function isoDates(values,names){const result={...values};names.forEach(name=>result[name]=toIso(result[name]));return result;} function toIso(value){const parsed=new Date(value);return Number.isNaN(parsed.valueOf())?value:parsed.toISOString();}
function formatDate(value){return I18N.formatDate(value);} function money(value){return I18N.formatNumber(value,{maximumFractionDigits:2});}
function statusLabel(value){const key=`status.${value}`;const translated=I18N.t(key);return translated===key?stageLabel(value):translated;}
// Identifiers here are prefixed by their kind: product-style_8390232a-…, selection_c49bce4f-….
// Slicing the first characters showed the prefix and hid the part that tells two rows apart, so
// every style read as the identical "product-…". The kind is dropped first.
function shortId(value){const text=String(value||'');const tail=text.includes('_')?text.slice(text.lastIndexOf('_')+1):text;return tail.length>10?`${tail.slice(0,8)}\u2026`:(tail||'\u2014');}
// A reference a person can read out over the phone. Orders, selections and deal spaces are keyed by
// generated identifiers, and the registers showed them raw: "order_8c22a11c-e886-4c9d-8078-bebb804f6a65"
// is not a name, it cannot be quoted, and two of them side by side look identical.
//
// This is a display rule, not a new identity. The full identifier stays the key everywhere it matters
// and is still shown in the inspector and on hover; what changes is that the column a person scans
// carries something they can hold in their head.
const OBJECT_REFERENCE_PREFIX={order:'ORD',selection:'SEL',deal:'DEAL',cycle:'CYC',showroom:'SHR',invitation:'INV'};
function objectReference(value){
  const text=String(value||'').trim();
  if(!text) return '\u2014';
  const underscore=text.indexOf('_');
  const kind=underscore>0?text.slice(0,underscore):'';
  const tail=(underscore>0?text.slice(underscore+1):text).replace(/-/g,'');
  const prefix=OBJECT_REFERENCE_PREFIX[kind];
  if(!prefix||tail.length<8) return text;
  return `${prefix}-${tail.slice(0,8).toUpperCase()}`;
}
// The same rule applied inside a sentence somebody else wrote. Calendar events and notifications carry
// server-written titles such as "Deal opened for order_8c22a11c-…", and the identifier in the middle of
// them is the part nobody can read.
function humaniseIdentifiers(value){
  return String(value??'').replace(/\b(order|selection|deal|cycle|showroom|invitation)_[0-9a-f-]{8,}\b/gi,(match)=>objectReference(match));
}
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
function emptyWorkspace(){return{memberships:[],organisations:[],relationships:[],invitations:[],campaigns:[],collections:[],productStyles:[],placeholders:[],colorways:[],media:[],catalogSkus:[],showrooms:[],cycles:[],selections:[],orders:[],deals:[],calendar:[],pageInfo:{limit:0,hasMore:false,truncatedSections:[],nextCursors:{}}};}
