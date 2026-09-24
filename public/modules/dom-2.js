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
function formatDate(value){return I18N.formatDate(value);} // Money keeps both decimals. Without a minimum, 4.10 printed as «4,1» and 189.00 as «189», which
// reads as a quantity rather than a price.
// Деньги и единицы форматирует рантайм i18n — одно место на всё приложение. Здесь остаются только
// короткие имена, которыми пользуются экраны: валюту можно не передавать там, где её печатают
// отдельной колонкой, и тогда выводится голое число, как и раньше.
function money(value,currency,options){return I18N.formatMoney(value,currency,options);}
function unitAmount(value,unit,options){return I18N.formatUnit(value,unit,options);}
function statusLabel(value){const key=`status.${value}`;const translated=I18N.t(key);return translated===key?stageLabel(value):translated;}
// Identifiers here are prefixed by their kind: product-style_8390232a-…, selection_c49bce4f-….
// Slicing the first characters showed the prefix and hid the part that tells two rows apart, so
// every style read as the identical "product-…". The kind is dropped first.
const SVG_NS='http://www.w3.org/2000/svg';
function shortId(value){const text=String(value||'');const tail=text.includes('_')?text.slice(text.lastIndexOf('_')+1):text;return tail.length>10?`${tail.slice(0,8)}\u2026`:(tail||'\u2014');}
// One colour swatch for the whole product. A colour is data, and the loaded UI runtime is not
// allowed to write inline styles, so it is drawn as an SVG with a fill attribute. The model
// register and the buyer's catalogue had each grown their own: the buyer's was a disabled
// <input type="color">, which the design system paints as a disabled form field -- grey ground,
// heavy border, and a pale colour all but invisible inside it.
function colourSwatch(hex, label) {
  const valid = /^#[0-9A-Fa-f]{6}$/.test(String(hex || '')) ? String(hex) : '#F2F4F7';
  const cell = document.createElementNS(SVG_NS, 'svg');
  cell.setAttribute('class', 'od-colour-swatch');
  cell.setAttribute('viewBox', '0 0 22 14');
  cell.setAttribute('width', '22');
  cell.setAttribute('height', '14');
  cell.setAttribute('role', 'img');
  cell.setAttribute('aria-label', String(label || valid));
  const rect = document.createElementNS(SVG_NS, 'rect');
  rect.setAttribute('x', '0.5'); rect.setAttribute('y', '0.5');
  rect.setAttribute('width', '21'); rect.setAttribute('height', '13');
  rect.setAttribute('rx', '2'); rect.setAttribute('fill', valid); rect.setAttribute('stroke', '#E1E4E7');
  cell.append(rect);
  const title = document.createElementNS(SVG_NS, 'title');
  title.textContent = String(hex || '');
  cell.append(title);
  return cell;
}

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
// What a notification says, written where the reader's language is known.
//
// The projection used to store a finished English sentence, so a Russian reader saw English and could
// never see anything else. It now stores what happened and the facts of it as well; the sentence is
// composed here. A notification written before that change still has only its English text, so that
// text is the fallback rather than a blank line.
const NOTIFICATION_TEXT = {
  'selection-submitted': {
    title: ['\u0410\u0441\u0441\u043e\u0440\u0442\u0438\u043c\u0435\u043d\u0442 \u043e\u0442\u043f\u0440\u0430\u0432\u043b\u0435\u043d', 'Selection submitted'],
    body: (p) => [`\u041c\u0430\u0433\u0430\u0437\u0438\u043d \u043e\u0442\u043f\u0440\u0430\u0432\u0438\u043b \u0430\u0441\u0441\u043e\u0440\u0442\u0438\u043c\u0435\u043d\u0442 ${objectReference(p.selectionId)}: \u043f\u043e\u0437\u0438\u0446\u0438\u0439 \u2014 ${p.lineCount}.`,
      `The shop submitted selection ${objectReference(p.selectionId)} with ${p.lineCount} line(s).`],
  },
  'order-terms-accepted': {
    title: ['\u0423\u0441\u043b\u043e\u0432\u0438\u044f \u0437\u0430\u043a\u0430\u0437\u0430 \u043f\u0440\u0438\u043d\u044f\u0442\u044b', 'Order terms accepted'],
    body: (p) => [`\u0423\u0441\u043b\u043e\u0432\u0438\u044f \u0437\u0430\u043a\u0430\u0437\u0430 ${objectReference(p.orderId)} \u043f\u0440\u0438\u043d\u044f\u0442\u044b \u0432\u0442\u043e\u0440\u043e\u0439 \u0441\u0442\u043e\u0440\u043e\u043d\u043e\u0439.`,
      `The other side accepted the terms of order ${objectReference(p.orderId)}.`],
  },
  'deal-opened': {
    title: ['\u041f\u0440\u043e\u0441\u0442\u0440\u0430\u043d\u0441\u0442\u0432\u043e \u0441\u0434\u0435\u043b\u043a\u0438 \u043e\u0442\u043a\u0440\u044b\u0442\u043e', 'Deal space opened'],
    body: (p) => [`\u041f\u043e \u0437\u0430\u043a\u0430\u0437\u0443 ${objectReference(p.orderId)} \u043e\u0442\u043a\u0440\u044b\u0442\u043e \u043f\u0440\u043e\u0441\u0442\u0440\u0430\u043d\u0441\u0442\u0432\u043e \u0441\u0434\u0435\u043b\u043a\u0438.`,
      `A deal space is open on order ${objectReference(p.orderId)}.`],
  },
};
function notificationTitle(item){
  const entry=NOTIFICATION_TEXT[item?.type];
  if(!entry) return humaniseIdentifiers(item?.title||item?.type||'');
  return I18N.getLocale()==='en'?entry.title[1]:entry.title[0];
}
function notificationBody(item){
  const entry=NOTIFICATION_TEXT[item?.type];
  const params=item?.params;
  if(!entry||!params||!Object.keys(params).length) return humaniseIdentifiers(item?.body||item?.message||'\u2014');
  const pair=entry.body(params);
  return I18N.getLocale()==='en'?pair[1]:pair[0];
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
