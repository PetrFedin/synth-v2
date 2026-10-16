import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../public/modules/tech-packs.js', import.meta.url), 'utf8');
const pack = code => ({ techPackCode:code, sku:'SKU-'+code, title:code, brandId:'brand-1',
  issueFormat:'canonical-v1', revision:1, status:'issued', version:2 });
const evidence = (code,hash) => ({
  admission:{admitted:true,documentHash:hash,decisions:[]},
  document:{documentHash:hash,header:{techPackCode:code,sku:'SKU-'+code,revision:1},
    product:{},supplier:{},bom:{lines:[]},measurement:{sizes:[],points:[]},
    operations:{rows:[],totalStandardMinutes:0},sketches:{rows:[]},evidenceManifest:{}},
});
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};}
class NodeMock {
  constructor(tag){this.tagName=String(tag).toUpperCase();this.children=[];this.listeners={};
    this.attributes={};this._text='';this.className='';this.disabled=false;}
  append(...items){this.children.push(...items);}
  setAttribute(k,v){this.attributes[k]=String(v);}
  addEventListener(k,fn){this.listeners[k]=fn;}
  get textContent(){return this._text+this.children.map(c=>c?.textContent??String(c)).join('');}
  set textContent(v){this._text=String(v);this.children=[];}
}
const all = node => [node,...node.children.flatMap(child=>child instanceof NodeMock?all(child):[])];
function press(root,predicate){
  const element=all(root).find(node=>node.tagName && predicate(node));
  assert.ok(element,'control present');
  assert.equal(typeof element.listeners.click,'function','real click handler');
  element.listeners.click({preventDefault(){},stopImmediatePropagation(){}});
}
const btn = title => node => node.tagName==='BUTTON' && node.textContent===title;
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function setup(items,handler,locale='ru'){
  let refresh,routeTarget;
  const requests=[],errors=[];
  const state={view:'tech-packs',token:'session-A',workspace:{catalogSkus:[]}};
  const window={
    SynthaTechPackCore:{
      summarize:a=>({total:a.length,issued:0,ready:0,blocked:a.length}),
      filter:a=>a,isProductionReady:()=>false,allowedActions:()=>[],
    },
    SynthaUiCapabilities:{
      CAPABILITIES:{TECH_PACK_MANAGE:'tech-pack.manage',TECH_PACK_ACKNOWLEDGE:'tech-pack.acknowledge'},
      hasForOrganisation:()=>false,hasAny:()=>false,
    },
    SynthaTechPackCanonicalInspector:{invalidate(){},render:()=>new NodeMock('section')},
    SynthaOmnidataV7Nav:{activate(){}},
    SynthaViewRefresh:{
      register:(_key,fn)=>{refresh=fn;},
      registerTarget:(_key,fn)=>{routeTarget=fn;},
    },
  };
  const context=vm.createContext({window,state,Node:NodeMock,
    document:{createElement:tag=>new NodeMock(tag),createTextNode:value=>({textContent:String(value)})},
    api:path=>{requests.push(path);return handler(path);},
    localText:(ru,en)=>locale==='en'?en:ru,
    I18N:{getLocale:()=>locale,localeTag:()=>locale==='en'?'en-US':'ru-RU',
      t:k=>k,formatMoney:v=>String(v),formatNumber:v=>String(v)},
    renderApp(){},renderView:()=>new NodeMock('div'),
    renderNavigation:()=>({querySelectorAll:()=>[]}),
    reportError:e=>errors.push(e),toast:m=>errors.push(m),
    statusLabel:v=>v,formatDate:v=>v,queueMicrotask,URLSearchParams,encodeURIComponent,Intl,Date,
  });
  vm.runInContext(source,context,{filename:'tech-packs.js'});
  const ui=window.SynthaTechPacksWorkspace;
  ui.loaded=true;ui.items=items;ui.selectedCode=items[0]?.techPackCode??null;
  for(const item of items)ui.sequenceBySku[item.sku]=null;
  return {ui,state,requests,errors,render:()=>context.renderView(),refresh:()=>refresh(),
    routeTarget:route=>routeTarget(route)};
}

test('late previous-pack success cannot overwrite a newly selected admitted document',async()=>{
  const a=deferred(),b=deferred();
  const h=setup([pack('TP-A'),pack('TP-B')],
    path=>path.includes('TP-A')?a.promise:b.promise);
  press(h.render(),btn('Документ'));
  press(h.render(),node=>node.tagName==='TR'&&node.textContent.includes('TP-B'));
  press(h.render(),btn('Документ'));
  b.resolve(evidence('TP-B','HASH-B'));await flush();
  assert.equal(h.ui.document.envelope.document.documentHash,'HASH-B');
  a.resolve(evidence('TP-A','HASH-A'));await flush();
  assert.equal(h.ui.document.envelope.document.documentHash,'HASH-B');
  assert.doesNotMatch(h.render().textContent,/HASH-A/);
});

test('refresh and route reset invalidate an in-flight document',async()=>{
  const old=deferred();
  const h=setup([pack('TP-A')],path=>path.includes('canonical-document')?old.promise:
    {items:[pack('TP-A')],nextCursor:null});
  press(h.render(),btn('Документ'));
  await h.refresh();
  h.routeTarget({entityId:'TP-A'});
  old.resolve(evidence('TP-A','STALE-HASH'));await flush();
  assert.equal(h.ui.document,null);
  assert.doesNotMatch(h.render().textContent,/STALE-HASH/);
});

test('switching user session removes even an earlier successful document',async()=>{
  const h=setup([pack('TP-A')],()=>evidence('TP-A','ADMITTED-HASH'),'en');
  press(h.render(),btn('Document'));await flush();
  assert.match(h.render().textContent,/ADMITTED-HASH/);
  assert.match(h.render().textContent,/Print still gated/);
  h.state.token='session-B';
  assert.doesNotMatch(h.render().textContent,/ADMITTED-HASH/);
  assert.equal(h.ui.document,null);
});

test('revoked rights cannot revive the previous document',async()=>{
  let n=0;
  const h=setup([pack('TP-A')],async()=>{
    if(++n===1)return evidence('TP-A','BEFORE-REVOKE');
    throw new Error('CURRENT_RIGHTS_REVOKED');
  });
  press(h.render(),btn('Документ'));await flush();
  assert.match(h.render().textContent,/BEFORE-REVOKE/);
  press(h.render(),btn('Закрыть'));
  press(h.render(),btn('Документ'));await flush();
  assert.equal(h.ui.document,null);
  assert.doesNotMatch(h.render().textContent,/BEFORE-REVOKE/);
  assert.ok(h.errors.some(x=>String(x).includes('CURRENT_RIGHTS_REVOKED')));
});

test('slash-coded canonical pack always uses the safe query-addressed endpoint',async()=>{
  const h=setup([pack('TP/2026/001')],()=>evidence('TP/2026/001','SLASH-HASH'));
  press(h.render(),btn('Документ'));await flush();
  assert.deepEqual(h.requests,
    ['/v2/tech-packs/by-code/canonical-document?code=TP%2F2026%2F001']);
  assert.match(h.render().textContent,/SLASH-HASH/);
});
