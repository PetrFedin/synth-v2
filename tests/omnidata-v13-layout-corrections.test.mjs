import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function source(path){return readFile(new URL(`../${path}`,import.meta.url),'utf8')}

test('V13 restores an understandable expanded sidebar',async()=>{
  const css=await source('public/omnidata-v13.css');
  for(const token of ['--od13-sidebar:220px','grid-template-columns:var(--od13-sidebar) minmax(0,1fr)!important','display:block!important','justify-content:flex-start!important','position:sticky!important','height:100vh!important']) assert.ok(css.includes(token),token);
  assert.match(css,/\.brand-copy,body\.omnidata-v13 \.nav-group-label,body\.omnidata-v13 \.nav-label/);
  assert.match(css,/sidebar-footer>\.sidebar-action:last-child\{display:none!important\}/);
  assert.match(css,/@media\(max-width:820px\)/);
  assert.doesNotMatch(css,/@import|https?:\/\//i);
});

test('V13 prevents collection, status, toolbar and inspector collisions',async()=>{
  const css=await source('public/omnidata-v13.css');
  for(const token of ['grid-template-columns:minmax(150px,.8fr) minmax(180px,1.2fr) minmax(120px,auto)!important','grid-template-columns:minmax(0,1fr) auto!important','position:static!important','flex-wrap:wrap!important','overflow-wrap:anywhere!important','grid-template-columns:repeat(auto-fit,minmax(130px,1fr))!important','overflow-x:auto!important','grid-template-areas:"identity metadata actions"!important','min-width:760px!important']) assert.ok(css.includes(token),token);
  assert.match(css,/\.grid\.two\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important\}/);
  assert.match(css,/\.od-inspector-head/);
  assert.match(css,/@media\(max-width:1180px\).*\.grid\.two/s);
});

test('V13 calibrates typography, controls and containers to the Omnidata reference',async()=>{
  const css=await source('public/omnidata-v13.css');
  for(const token of ['font-family:Arial,"Helvetica Neue",Helvetica,sans-serif','--od13-accent:#ff5a1f','--od13-sidebar-bg:#373b47','--od13-control-height:32px','border-radius:var(--od13-radius)!important','box-shadow:none!important']) assert.ok(css.includes(token),token);
  assert.match(css,/\.od-tabs,body\.omnidata-v13 \.ls9-tabs/);
  assert.match(css,/\.od-table th/);
});

test('V13 preserves strict RU and EN shell behaviour',async()=>{
  const js=await source('public/modules/omnidata-v13.js');
  assert.doesNotThrow(()=>new Function(js));
  for(const token of ["const BUILD='visual-20260804-13'","I18N.getLocale()==='en'?'en':'ru'","document.body.classList.add('omnidata-v13')","classList.remove('sidebar-collapsed')","state.sidebarCollapsed=false","Поиск в текущем разделе","Search current section","translateTextNodes","MutationObserver","syntha:locale-changed","global.SynthaOmnidataV13=Object.freeze"]) assert.ok(js.includes(token),token);
});

test('V13 is the final delivered corrective layer',async()=>{
  const html=await source('public/index.html');
  const handler=await source('src/web/static-handler.mjs');
  assert.match(html,/meta name="syntha-build" content="visual-20260804-13"/);
  assert.ok(html.indexOf('/omnidata-v13.css?v=visual-20260804-13')>html.indexOf('/omnidata-v12.css?v=visual-20260804-12'));
  assert.ok(html.indexOf('/ui/omnidata-v13.js?v=visual-20260804-13')>html.indexOf('/ui/omnidata-v12.js?v=visual-20260804-12'));
  assert.ok(handler.includes("'/omnidata-v13.css': ['omnidata-v13.css'"));
  assert.ok(handler.includes("'/ui/omnidata-v13.js': ['modules/omnidata-v13.js'"));
});
