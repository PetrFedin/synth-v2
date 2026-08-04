import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function source(path){return readFile(new URL(`../${path}`,import.meta.url),'utf8')}

test('V11 matches the uploaded Omnidata interface language',async()=>{
  const css=await source('public/omnidata-v11.css');
  for(const token of [
    '--od11-canvas:#f7f8f8','--od11-sidebar:#373b47','--od11-text:#343740','--od11-accent:#ff5a1f',
    '--od11-sidebar-width:54px','--od11-topbar-height:48px','--od11-control-height:30px','--od11-row-height:52px'
  ])assert.ok(css.includes(token),token);
  for(const selector of ['body.omnidata-v11 .sidebar','body.omnidata-v11 .topbar','body.omnidata-v11 .button.primary','body.omnidata-v11 .od-table','body.omnidata-v11 .ls9-table','body.omnidata-v11 .sample-table','body.omnidata-v11 .od-inspector','body.omnidata-v11 .od-v7-language-switcher'])assert.ok(css.includes(selector),selector);
  assert.match(css,/font-family:Arial/);
  assert.match(css,/background:var\(--od11-accent\)/);
  assert.match(css,/box-shadow:inset 2px 0 0 var\(--od11-accent\)/);
  assert.doesNotMatch(css,/@import|https?:\/\//i);
});

test('V11 preserves strict RU and EN switching after every render',async()=>{
  const js=await source('public/modules/omnidata-v11.js');
  assert.doesNotThrow(()=>new Function(js));
  for(const contract of ["const BUILD='visual-20260804-11'","I18N.getLocale()==='en'?'en':'ru'","document.documentElement.lang=activeLocale","document.body.classList.add('omnidata-v11')","const previousRenderApp=renderApp","global.SynthaOmnidataV11=Object.freeze"])assert.ok(js.includes(contract),contract);
  assert.match(js,/Search current section/);
  assert.match(js,/Поиск в текущем разделе/);
  assert.match(js,/Fashion Operating System/);
  assert.match(js,/операционная система моды/);
});

test('V11 is delivered after V10 with no-store assets',async()=>{
  const html=await source('public/index.html');
  const handler=await source('src/web/static-handler.mjs');
  assert.match(html,/meta name="syntha-build" content="visual-20260804-11"/);
  assert.ok(html.indexOf('/omnidata-v11.css?v=visual-20260804-11')>html.indexOf('/omnidata-v10.css?v=visual-20260804-10'));
  assert.ok(html.indexOf('/ui/omnidata-v11.js?v=visual-20260804-11')>html.indexOf('/ui/omnidata-v10.js?v=visual-20260804-10'));
  assert.ok(handler.includes("'/omnidata-v11.css': ['omnidata-v11.css'"));
  assert.ok(handler.includes("'/ui/omnidata-v11.js': ['modules/omnidata-v11.js'"));
  assert.match(handler,/const VISUAL_CACHE = 'no-store'/);
});
