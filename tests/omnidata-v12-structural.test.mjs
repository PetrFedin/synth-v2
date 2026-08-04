import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source=(path)=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('V12 structurally matches the compact Omnidata PLM shell',async()=>{
  const css=await source('public/omnidata-v12.css');
  for(const token of ['--od12-rail:52px','--od12-top:46px','--od12-tabs:36px','--od12-control:28px','--od12-row:46px','--od12-accent:#f35a24'])assert.ok(css.includes(token),token);
  for(const selector of ['body.omnidata-v12 .sidebar','body.omnidata-v12 .topbar','body.omnidata-v12 .od-tabs','body.omnidata-v12 .od-commandbar','body.omnidata-v12 .od-table th','body.omnidata-v12 .od-table td','body.omnidata-v12 .od-inspector'])assert.ok(css.includes(selector),selector);
  assert.match(css,/grid-template-columns:minmax\(0,1fr\) minmax\(310px,350px\)/);
  assert.doesNotMatch(css,/@import|https?:\/\//i);
});

test('V12 keeps one strict RU or EN interface after every render',async()=>{
  const js=await source('public/modules/omnidata-v12.js');
  assert.doesNotThrow(()=>new Function(js));
  for(const contract of ["const BUILD='visual-20260804-12'","I18N.getLocale()==='en'?'en':'ru'","document.documentElement.lang=active","document.body.dataset.locale=active","document.body.classList.add('omnidata-v12')","const previousRenderApp=renderApp","global.SynthaOmnidataV12=Object.freeze"])assert.ok(js.includes(contract),contract);
  assert.match(js,/Search current section/);
  assert.match(js,/Поиск в текущем разделе/);
});

test('V12 is delivered after V11 without stale cache',async()=>{
  const html=await source('public/index.html');
  const handler=await source('src/web/static-handler.mjs');
  assert.match(html,/meta name="syntha-build" content="visual-20260804-12"/);
  assert.ok(html.indexOf('/omnidata-v12.css?v=visual-20260804-12')>html.indexOf('/omnidata-v11.css?v=visual-20260804-11'));
  assert.ok(html.indexOf('/ui/omnidata-v12.js?v=visual-20260804-12')>html.indexOf('/ui/omnidata-v11.js?v=visual-20260804-11'));
  assert.ok(handler.includes("'/omnidata-v12.css': ['omnidata-v12.css'"));
  assert.ok(handler.includes("'/ui/omnidata-v12.js': ['modules/omnidata-v12.js'"));
});
