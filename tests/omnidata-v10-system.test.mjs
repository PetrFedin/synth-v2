import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const source=(path)=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('V10 remains a valid calibrated base',async()=>{const css=await source('public/omnidata-v10.css');assert.match(css,/--od10-accent: #6242d1/);assert.match(css,/body\.omnidata-v10 \.od-table/);assert.doesNotMatch(css,/@import|https?:\/\//i)});
test('V10 bilingual runtime remains syntactically valid',async()=>{const js=await source('public/modules/omnidata-v10.js');assert.doesNotThrow(()=>new Function(js));assert.match(js,/SynthaOmnidataV10/);assert.match(js,/Поиск в текущем разделе/)});
test('V10 through V13 remain beneath final V14 correction',async()=>{const html=await source('public/index.html');const handler=await source('src/web/static-handler.mjs');const paths=['/omnidata-v10.css?v=visual-20260804-10','/omnidata-v11.css?v=visual-20260804-11','/omnidata-v12.css?v=visual-20260804-12','/omnidata-v13.css?v=visual-20260804-13','/omnidata-v14.css?v=visual-20260805-14'];let previous=-1;for(const path of paths){const index=html.indexOf(path);assert.ok(index>previous,path);previous=index}assert.match(html,/meta name="syntha-build" content="visual-20260805-14"/);assert.ok(handler.includes("'/omnidata-v14.css': ['omnidata-v14.css'"))});
