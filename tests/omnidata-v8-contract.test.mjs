import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const source=(path)=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('V8 remains a valid calibrated base',async()=>{const css=await source('public/omnidata-v8-reference.css');assert.match(css,/--od8-sidebar-width: 204px/);assert.match(css,/--od8-accent: #5d39cf/);assert.doesNotMatch(css,/@import|https?:\/\//i)});
test('V8 locale runtime remains syntactically valid',async()=>{const js=await source('public/modules/omnidata-v8.js');assert.doesNotThrow(()=>new Function(js));assert.match(js,/SynthaOmnidataV8/)});
test('V8 through V11 remain ordered beneath final V12',async()=>{const html=await source('public/index.html');const handler=await source('src/web/static-handler.mjs');const paths=['/omnidata-v8.css?v=visual-20260804-8','/omnidata-v8-reference.css?v=visual-20260804-8','/omnidata-v9.css?v=visual-20260804-9','/omnidata-v10.css?v=visual-20260804-10','/omnidata-v11.css?v=visual-20260804-11','/omnidata-v12.css?v=visual-20260804-12'];let previous=-1;for(const path of paths){const index=html.indexOf(path);assert.ok(index>previous,path);previous=index}assert.match(html,/meta name="syntha-build" content="visual-20260804-12"/);assert.ok(handler.includes("'/ui/omnidata-v12.js': ['modules/omnidata-v12.js'"))});
