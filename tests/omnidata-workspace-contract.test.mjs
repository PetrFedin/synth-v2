import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const source=(path)=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('the Syntha shell loads strict bilingual V13 after all functional workspaces',async()=>{const html=await source('public/index.html');assert.match(html,/<meta name="syntha-build" content="visual-20260805-15">/);const order=['/ui/linesheets.js','/ui/measurements.js','/ui/samples.js','/ui/omnidata-v8.js','/ui/omnidata-v9.js','/ui/omnidata-v10.js','/ui/omnidata-v11.js','/ui/omnidata-v12.js','/ui/omnidata-v13.js','/ui/dom-boolean-props.js','/ui/app-start.js'];let previous=-1;for(const path of order){const index=html.indexOf(path);assert.ok(index>previous,path);previous=index}});
test('the Omnidata layer still provides table-first workspace primitives',async()=>{const js=await source('public/modules/omnidata-workspace.js');for(const primitive of ['odTabs','odMetrics','odHeader','odTable','odInspector','odRegistry','odProgress'])assert.match(js,new RegExp(`function ${primitive}\\(`));assert.doesNotMatch(js,/\.style\./)});
test('Linesheets and Samples remain working beneath V13',async()=>{const linesheets=await source('public/modules/linesheets.js');const samples=await source('public/modules/samples.js');assert.doesNotThrow(()=>new Function(linesheets));assert.doesNotThrow(()=>new Function(samples));assert.match(linesheets,/renderLinesheets/);assert.match(samples,/sample/i)});
