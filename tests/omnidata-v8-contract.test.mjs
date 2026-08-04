import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
async function source(path){return readFile(new URL(`../${path}`,import.meta.url),'utf8')}

test('Omnidata V8 calibration matches the supplied reference geometry',async()=>{
  const base=await source('public/omnidata-v8.css');
  const reference=await source('public/omnidata-v8-reference.css');
  for(const token of ['--od8-canvas: #f7f8fc','--od8-surface: #ffffff','--od8-sidebar: #111c31','--od8-text: #252938','--od8-accent: #5d39cf','--od8-sidebar-width: 204px','--od8-topbar-height: 59px','--od8-row-height: 72px'])assert.ok(reference.includes(token),token);
  assert.match(reference,/\.od-master-detail,[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) minmax\(420px, 455px\)/);
  assert.match(reference,/\.od-v7-system-footer\s*\{[^}]*height:\s*38px/s);
  assert.match(base,/body\.omnidata-v8 \.button\.primary/);
  assert.doesNotMatch(`${base}\n${reference}`,/@import|https?:\/\//i);
});

test('Omnidata V8 applies one strict locale to every system workspace',async()=>{
  const js=await source('public/modules/omnidata-v8.js');
  assert.doesNotThrow(()=>new Function(js));
  for(const view of ['overview','planning','catalog','styles','materials','boms','measurements','partners','showrooms','selections','orders','calendar','notifications'])assert.match(js,new RegExp(`\\b${view}:\\s*\\{`),view);
  for(const contract of ["const BUILD = 'visual-20260804-8'","I18N.getLocale() === 'en' ? 'en' : 'ru'","document.documentElement.lang = activeLocale","document.body.classList.add('omnidata-v8')","window.SynthaOmnidataV8 = Object.freeze"])assert.ok(js.includes(contract),contract);
});

test('V8 remains the calibrated base, V9 provides Linesheets, V10 system calibration and V11 the final PDF-reference layer',async()=>{
  const html=await source('public/index.html');
  const handler=await source('src/web/static-handler.mjs');
  const css=['/omnidata-v8.css?v=visual-20260804-8','/omnidata-v8-reference.css?v=visual-20260804-8','/omnidata-v9.css?v=visual-20260804-9','/omnidata-v10.css?v=visual-20260804-10','/omnidata-v11.css?v=visual-20260804-11'].map(value=>html.indexOf(value));
  assert.ok(css.every((value,index)=>value>=0&&(index===0||value>css[index-1])));
  const scripts=['/ui/omnidata-v8.js?v=visual-20260804-8','/ui/omnidata-v9.js?v=visual-20260804-9','/ui/omnidata-v10.js?v=visual-20260804-10','/ui/omnidata-v11.js?v=visual-20260804-11','/ui/dom-boolean-props.js?v=visual-20260804-9','/ui/app-start.js'].map(value=>html.indexOf(value));
  assert.ok(scripts.every((value,index)=>value>=0&&(index===0||value>scripts[index-1])));
  assert.match(html,/meta name="syntha-build" content="visual-20260804-11"/);
  for(const route of ["'/omnidata-v8.css': ['omnidata-v8.css'","'/omnidata-v9.css': ['omnidata-v9.css'","'/omnidata-v10.css': ['omnidata-v10.css'","'/omnidata-v11.css': ['omnidata-v11.css'","'/ui/omnidata-v11.js': ['modules/omnidata-v11.js'"])assert.ok(handler.includes(route),route);
  assert.match(handler,/const VISUAL_CACHE = 'no-store'/);
});
