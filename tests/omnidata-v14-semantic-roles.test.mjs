import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

function element({ tag='div', className='', role='', contains=[] }={}){
  return {
    nodeType:1, tagName:tag.toUpperCase(), className, dataset:{},
    matches(){return false},
    getAttribute(name){return name==='role'?role:null},
    querySelector(selector){return contains.some((value)=>selector.includes(value))?{}:null},
    querySelectorAll(){return[]},
  };
}

async function runtime(){
  const source=await readFile(new URL('../public/modules/omnidata-v14-components.js',import.meta.url),'utf8');
  const document={body:{classList:{add(){}},dataset:{}},documentElement:{},querySelectorAll(){return[]}};
  const window={queueMicrotask(){},addEventListener(){},SynthaI18n:{getLocale(){return'ru'}}};
  const context={window,document,console};
  vm.runInNewContext(source,context,{filename:'omnidata-v14-components.js'});
  return window.SynthaOmnidataV14Components;
}

test('semantic role classifier normalizes unrelated legacy class vocabularies',async()=>{
  const api=await runtime();
  const cases=[
    [element({className:'legacy-table-registry',contains:['table']}),'table-wrap'],
    [element({tag:'table',className:'production-execution-table'}),'table'],
    [element({className:'production-execution-filters'}),'filterbar'],
    [element({className:'supplier-card'}),'card'],
    [element({className:'production-execution-badge ready'}),'status'],
    [element({className:'legacy-details-panel'}),'inspector'],
    [element({role:'alert',className:'server-message'}),'alert'],
    [element({role:'tablist',className:'legacy-switcher'}),'tabs'],
  ];
  for(const [node,expected] of cases)assert.equal(api.semanticRoleFor(node),expected,node.className);
});

test('semantic component runtime exposes coverage diagnostics and strict bilingual support',async()=>{
  const api=await runtime();
  assert.equal(api.build,'visual-20260805-14-components-3');
  assert.equal(typeof api.assignComponents,'function');
  assert.equal(typeof api.classifyLegacyComponents,'function');
  assert.equal(typeof api.auditComponents,'function');
  assert.equal(typeof api.translateText,'function');
  assert.equal(typeof api.auditLanguage,'function');
  assert.ok(Array.isArray(api.roleRules));
});
