import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const source=(path)=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('V11 remains the Omnidata PDF visual calibration layer',async()=>{const css=await source('public/omnidata-v11.css');for(const token of ['--od11-sidebar:#373b47','--od11-accent:#ff5a1f','--od11-sidebar-width:54px','--od11-topbar-height:48px'])assert.ok(css.includes(token),token);assert.match(css,/body\.omnidata-v11 \.od-table/);assert.doesNotMatch(css,/@import|https?:\/\//i)});
test('V11 bilingual runtime remains valid',async()=>{const js=await source('public/modules/omnidata-v11.js');assert.doesNotThrow(()=>new Function(js));assert.match(js,/SynthaOmnidataV11/);assert.match(js,/Поиск в текущем разделе/)});
test('V11 remains beneath V12, V13 and final V14 delivery',async()=>{const html=await source('public/index.html');const handler=await source('src/web/static-handler.mjs');assert.match(html,/meta name="syntha-build" content="visual-20260805-14"/);assert.ok(html.indexOf('/omnidata-v14.css?v=visual-20260805-14')>html.indexOf('/omnidata-v13.css?v=visual-20260804-13'));assert.ok(html.indexOf('/ui/omnidata-v14.js?v=visual-20260805-14')>html.indexOf('/ui/omnidata-v13.js?v=visual-20260804-13'));assert.ok(handler.includes("'/omnidata-v14.css': ['omnidata-v14.css'"));assert.match(handler,/const VISUAL_CACHE = 'no-store'/)});
